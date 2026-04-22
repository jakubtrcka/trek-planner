import { type Page } from "playwright";
import { type BasicChallengeCard, type ChallengeLevel } from "./types";
import { type PeakIndex } from "./peaks";
import { type ChallengeItem } from "../schemas";
import { parseGpxWaypoints } from "./gpx";
import { parsePeakIdFromMountainLink, detectChallengeType, dedupeChallengeItems, normalizeText } from "./scraper";
import { findPeakIdForWaypoint } from "./peaks";

const DETAIL_BATCH_SIZE = 6;
const DETAIL_THROTTLE_MS = 700;
const DETAIL_BATCH_PAUSE_MS = 1800;

function mapWaypointsToPeakIds(waypoints: ReturnType<typeof parseGpxWaypoints>, index: PeakIndex): number[] {
  const peakIds = new Set<number>();
  for (const wp of waypoints) {
    const id = findPeakIdForWaypoint(wp, index, normalizeText);
    if (id) peakIds.add(id);
  }
  return Array.from(peakIds).sort((a, b) => a - b);
}

export async function extractChallengeDetail(
  page: Page,
  challenge: BasicChallengeCard,
  peakIndex: PeakIndex
): Promise<ChallengeItem> {
  await page.goto(challenge.url, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => null);
  await page.waitForTimeout(400);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const detail = await page.evaluate(
    ({ challengeUrl, challengeName }: { challengeUrl: string; challengeName: string }) => {
      const normalize = (v: string) => v.replace(/\s+/g, " ").trim();
      const rulesElement = document.querySelector("#rules");
      const rulesText = normalize(rulesElement?.textContent || "");
      const rulesHtml = rulesElement instanceof HTMLElement ? rulesElement.innerHTML.trim() : "";

      function parseCzechDate(d: string, m: string, y: string): string { return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`; }
      function extractDatePair(text: string): [string?, string?] {
        const matches = [...text.matchAll(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/g)];
        return [
          matches[0] ? parseCzechDate(matches[0][1], matches[0][2], matches[0][3]) : undefined,
          matches[1] ? parseCzechDate(matches[1][1], matches[1][2], matches[1][3]) : undefined,
        ];
      }

      let activeFrom: string | undefined;
      let activeTo: string | undefined;

      const isoTimes = Array.from(document.querySelectorAll("time[datetime]"))
        .map((el) => (el.getAttribute("datetime") ?? "").slice(0, 10))
        .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s));
      if (isoTimes.length >= 1) activeFrom = isoTimes[0];
      if (isoTimes.length >= 2) activeTo = isoTimes[isoTimes.length - 1];

      if (!activeFrom) {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node: Node | null;
        while ((node = walker.nextNode())) {
          if (!/Doba\s+trv[aá]n[íi]/i.test(node.textContent ?? "")) continue;
          let container: Element | null = node.parentElement;
          for (let i = 0; i < 5 && container; i++) {
            const [f, t] = extractDatePair(container.textContent ?? "");
            if (f) { activeFrom = f; activeTo = t; break; }
            container = container.parentElement;
          }
          if (activeFrom) break;
        }
      }

      if (!activeFrom) {
        const pageText = (document.body?.innerText ?? "").replace(/[ \t]+/g, " ");
        const idx = pageText.search(/Doba\s+trv[aá]n[íi]/i);
        if (idx >= 0) { const [f, t] = extractDatePair(pageText.slice(idx, idx + 300)); activeFrom = f; activeTo = t; }
      }

      if (!activeFrom) {
        for (const label of Array.from(document.querySelectorAll("dt, th, p.heading, .heading, strong, b"))) {
          if (!/trvání|aktivní|platnost/i.test(label.textContent ?? "")) continue;
          const container = label.closest(".box, .card, .info, article, section") ?? label.parentElement;
          const [f, t] = extractDatePair(container?.textContent ?? "");
          if (f) { activeFrom = f; activeTo = t; break; }
        }
      }

      let gpxUrl = "";
      for (const anchor of Array.from(document.querySelectorAll("a[href]"))) {
        const href = anchor.getAttribute("href") || "";
        const text = normalize(anchor.textContent || "");
        if (!href) continue;
        if (/\.gpx(\?|#|$)/i.test(href) || /stahnout.*gpx|download.*gpx|export.*gpx|gpx/i.test(text)) {
          gpxUrl = new URL(href, challengeUrl).toString();
          break;
        }
      }

      const mountainLinks = Array.from(document.querySelectorAll("a[href*='/mountain/']"))
        .map((a) => (a instanceof HTMLAnchorElement ? a.href : a.getAttribute("href") || ""))
        .filter(Boolean);

      const bodyText = (document.body?.textContent ?? "").toLowerCase();
      const endedByText = /výzva skon[čc]ila|výzva je ukon[čc]ena|výzva byla ukon[čc]ena|ukon[čc]ená výzva|challenge.*ended|challenge.*closed/.test(bodyText);
      const endedByElement = !!(
        document.querySelector('[class*="ended"], [class*="closed"], [class*="ukon"], [class*="finished"]') ??
        document.querySelector(".tag.is-danger, .badge-danger") ??
        Array.from(document.querySelectorAll(".tag, .badge, .label, .chip")).find((el) => /skon[čc]|ukon[čc]|zakon[čc]|ended|closed/i.test(el.textContent ?? ""))
      );
      const endedByDate = (() => {
        const now = Date.now();
        for (const el of Array.from(document.querySelectorAll("time[datetime], [data-end], [data-to]"))) {
          const dateStr = el.getAttribute("datetime") ?? el.getAttribute("data-end") ?? el.getAttribute("data-to") ?? "";
          if (!dateStr) continue;
          const ts = Date.parse(dateStr);
          if (Number.isFinite(ts) && ts < now) return true;
        }
        return false;
      })();

      let category: string | undefined;
      const normalizeSimple = (v: string) => v.replace(/\s+/g, " ").trim().toLowerCase();
      const normalizedChallengeName = normalizeSimple(challengeName);
      const candidates: string[] = [];
      for (const item of Array.from(document.querySelectorAll("nav.breadcrumb li, .breadcrumb li, [aria-label='breadcrumb'] li, ol.breadcrumb li"))) {
        const text = normalize(item.textContent ?? "").trim();
        if (text.length < 3 || /^v[yý]zv|^dom[uů]|^home|^\//i.test(text) || normalizeSimple(text) === normalizedChallengeName) continue;
        candidates.push(text);
      }
      if (candidates.length > 0) category = candidates[candidates.length - 1];

      type LevelRaw = { level: number; total: number; peakLinks: string[] };
      const levels: LevelRaw[] = [];
      const seenLevels = new Set<number>();
      const walker2 = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, {
        acceptNode(node) {
          if (!(node instanceof Element)) return NodeFilter.FILTER_SKIP;
          if (node.children.length > 3) return NodeFilter.FILTER_SKIP;
          return /^\d+\.\s*úrove[ňn]$/i.test((node.textContent ?? "").trim()) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
        },
      });
      let levelEl: Node | null;
      while ((levelEl = walker2.nextNode())) {
        if (!(levelEl instanceof Element)) continue;
        const levelMatch = /^(\d+)/.exec((levelEl.textContent ?? "").trim());
        if (!levelMatch) continue;
        const levelNum = parseInt(levelMatch[1], 10);
        if (seenLevels.has(levelNum)) continue;
        seenLevels.add(levelNum);
        let container: Element | null = levelEl.parentElement;
        for (let i = 0; i < 6 && container; i++) {
          const tag = container.tagName.toLowerCase();
          const cls = container.className ?? "";
          if (/column|card|box|article|section/i.test(tag) || /column|card|box|level/i.test(cls)) break;
          container = container.parentElement;
        }
        if (!container) container = levelEl.parentElement;
        const fractionMatch = (container?.textContent ?? "").match(/\b(\d+)\/(\d+)\b/);
        const total = fractionMatch ? parseInt(fractionMatch[2], 10) : 0;
        const levelPeakLinks = Array.from(container?.querySelectorAll("a[href*='/mountain/']") ?? [])
          .map((a) => (a instanceof HTMLAnchorElement ? a.href : a.getAttribute("href") ?? "")).filter(Boolean);
        if (total > 0 || levelPeakLinks.length > 0) levels.push({ level: levelNum, total, peakLinks: levelPeakLinks });
      }

      return { rulesText, rulesHtml, gpxUrl: gpxUrl || undefined, mountainLinks, isEnded: endedByText || endedByElement || endedByDate, category: category || undefined, activeFrom: activeFrom || undefined, activeTo: activeTo || undefined, levels: levels.length > 0 ? levels.sort((a, b) => a.level - b.level) : undefined };
    },
    { challengeUrl: challenge.url, challengeName: challenge.name }
  );

  let peakIds: number[] = detail.mountainLinks
    .map((link: string) => parsePeakIdFromMountainLink(link))
    .filter((v: number | null): v is number => v !== null);

  if (detail.gpxUrl) {
    const gpxResponse = await page.context().request.get(detail.gpxUrl, { timeout: 30_000 });
    if (gpxResponse.ok()) {
      const rawGpxData = await gpxResponse.text();
      const gpxPeakIds = mapWaypointsToPeakIds(parseGpxWaypoints(rawGpxData), peakIndex);
      peakIds = Array.from(new Set([...peakIds, ...gpxPeakIds])).sort((a, b) => a - b);
    }
  }

  peakIds = Array.from(new Set(peakIds)).sort((a, b) => a - b);
  const challengeType = detectChallengeType(challenge.name, detail.rulesText, Boolean(detail.gpxUrl), peakIds);

  let levels: ChallengeLevel[] | undefined;
  if (detail.levels && detail.levels.length > 0) {
    levels = detail.levels.map((l: { level: number; total: number; peakLinks: string[] }) => {
      const levelPeakIds = l.peakLinks
        .map((link: string) => parsePeakIdFromMountainLink(link))
        .filter((id: number | null): id is number => id !== null);
      const uniqueLevelIds = Array.from(new Set(levelPeakIds)).sort((a: number, b: number) => a - b);
      const isSamePool = uniqueLevelIds.length === 0 || (uniqueLevelIds.length === peakIds.length && uniqueLevelIds.every((id: number, i: number) => id === peakIds[i]));
      return { level: l.level, total: l.total || uniqueLevelIds.length, peakIds: isSamePool ? [] : uniqueLevelIds } satisfies ChallengeLevel;
    });
  }

  return {
    id: challenge.id, name: challenge.name, url: challenge.url,
    category: challenge.category ?? detail.category,
    activeFrom: challenge.activeFrom ?? detail.activeFrom,
    activeTo: challenge.activeTo ?? detail.activeTo,
    rulesText: detail.rulesText, rulesHtml: detail.rulesHtml || undefined,
    gpxUrl: detail.gpxUrl, isSpecificList: challengeType === "specific-list",
    isCrossword: challengeType === "crossword", challengeType, peakIds, levels,
    isEnded: detail.isEnded,
  } satisfies ChallengeItem;
}

export async function crawlChallengeDetails(
  page: Page,
  challengeCards: BasicChallengeCard[],
  peakIndex: PeakIndex,
  logger: { log: (m: string) => void },
  batchSize = DETAIL_BATCH_SIZE,
  throttleMs = DETAIL_THROTTLE_MS
): Promise<ChallengeItem[]> {
  const out: ChallengeItem[] = [];

  for (let start = 0; start < challengeCards.length; start += batchSize) {
    const batch = challengeCards.slice(start, start + batchSize);
    logger.log(`Detail batch ${Math.floor(start / batchSize) + 1}: ${batch.length} výzev.`);

    for (const challenge of batch) {
      logger.log(`Detail start: ${challenge.name} (${challenge.url})`);
      try {
        const detail = await extractChallengeDetail(page, challenge, peakIndex);
        logger.log(`Detail done: ${challenge.name}, type=${detail.challengeType}, peaks=${detail.peakIds?.length ?? 0}, ended=${detail.isEnded ? "yes" : "no"}`);
        if (!detail.isEnded) out.push(detail);
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown";
        logger.log(`Detail failed: ${challenge.name}, reason=${message}`);
        out.push({ id: challenge.id, name: challenge.name, url: challenge.url, rulesText: "", isSpecificList: false, challengeType: "unknown", peakIds: [] });
      }
      await page.waitForTimeout(throttleMs);
    }

    if (start + batchSize < challengeCards.length) {
      logger.log(`Batch pause: ${DETAIL_BATCH_PAUSE_MS}ms`);
      await page.waitForTimeout(DETAIL_BATCH_PAUSE_MS);
    }
  }

  return dedupeChallengeItems(out);
}
