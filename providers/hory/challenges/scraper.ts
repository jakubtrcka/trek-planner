import { type Page } from "playwright";
import { type BasicChallengeCard, type ChallengeType } from "./types";
import { type ChallengeItem } from "../schemas";

export const CHALLENGES_URL = "https://cs.hory.app/challenges";

// ── Text utilities ─────────────────────────────────────────────────────────────

export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&nbsp;/g, " ")
    .replace(/[^\p{L}\p{N}\s.-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parsePeakIdFromMountainLink(url: string | undefined): number | null {
  if (!url) return null;
  const match = url.match(/\/mountain\/(\d+)/i);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isFinite(id) ? id : null;
}

export function dedupeChallengeItems(challenges: ChallengeItem[]): ChallengeItem[] {
  const unique = new Map<string, ChallengeItem>();
  for (const challenge of challenges) unique.set(challenge.id, challenge);
  return Array.from(unique.values()).sort((a, b) => a.name.localeCompare(b.name, "cs"));
}

export function detectChallengeType(
  name: string,
  rulesText: string,
  hasGpx: boolean,
  peakIds: number[]
): ChallengeType {
  const combined = normalizeText(`${name} ${rulesText}`);
  if (/(tajenk|osmism|krizem krazem|prvni pismen)/i.test(combined)) return "crossword";
  if (
    /(<|>| pod | nad | vysk| nadmorsk| nizinar| vysinar| spln.*podmink| libovoln.*vrchol| jakykoliv vrchol| alespon )/i.test(combined) &&
    !hasGpx && peakIds.length === 0
  ) return "property-based";
  if (hasGpx || peakIds.length > 0 || /(seznam|vrchol(y|u)|navstiv|zdolej|projdi)/i.test(combined)) return "specific-list";
  return "unknown";
}

// ── DOM debug helpers ──────────────────────────────────────────────────────────

export async function collectChallengeDebugInfo(page: Page) {
  return page.evaluate(() => {
    const normalize = (v: string) => v.replace(/\s+/g, " ").trim();
    return {
      title: document.title,
      challengeLinkCount: document.querySelectorAll("a[href*='/challenge/']").length,
      overlayTextCount: document.querySelectorAll(".overlay-text").length,
      cardOverlayLinkCount: document.querySelectorAll("a.card-image-overlay[href*='/challenge/']").length,
      challengeColumnCount: document.querySelectorAll("div.column.is-3").length,
      snippetExists: Boolean(document.querySelector("#snippet-challenges")),
      bodySample: normalize(document.body?.innerText || "").slice(0, 400),
    };
  });
}

export async function waitForChallengeContent(page: Page, logger: { log: (m: string) => void }): Promise<void> {
  for (const delayMs of [0, 1000, 2500, 5000, 8000]) {
    if (delayMs > 0) await page.waitForTimeout(delayMs);
    const info = await collectChallengeDebugInfo(page);
    logger.log(
      `DOM snapshot: snippet=${info.snippetExists}, columns=${info.challengeColumnCount}, challengeLinks=${info.challengeLinkCount}, cardOverlayLinks=${info.cardOverlayLinkCount}, overlayTexts=${info.overlayTextCount}, title="${info.title}"`
    );
    if (info.cardOverlayLinkCount > 0 || info.overlayTextCount > 0 || info.challengeLinkCount > 0) return;
  }
}

export async function scrollToLoadAllChallenges(page: Page, logger: { log: (m: string) => void }): Promise<void> {
  let previousCount = 0;
  let stableRounds = 0;
  for (let round = 0; round < 25 && stableRounds < 2; round++) {
    const currentCount = await page.evaluate(() => document.querySelectorAll("a[href*='/challenge/']").length);
    if (currentCount === previousCount) stableRounds++;
    else { stableRounds = 0; previousCount = currentCount; }
    logger.log(`Scroll round ${round + 1}: ${currentCount} challenge links, stable=${stableRounds}`);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1200);
    const loadMore = page.getByRole("button", { name: /načíst více|zobrazit více|více výzev|load more|show more/i }).first();
    if ((await loadMore.count().catch(() => 0)) > 0) { await loadMore.click().catch(() => null); logger.log("Load-more button clicked."); await page.waitForTimeout(1200); }
    const nextPage = page.locator("a[rel='next'], a.pagination-next, li.next a").first();
    if ((await nextPage.count().catch(() => 0)) > 0) {
      await nextPage.click().catch(() => null);
      logger.log("Pagination next clicked.");
      await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => null);
      await page.waitForTimeout(800);
      stableRounds = 0;
    }
  }
  logger.log(`Scroll done. Final challenge link count: ${previousCount}`);
}

// ── Card list extraction ───────────────────────────────────────────────────────

export async function extractChallengeCardsWithLog(
  page: Page,
  logger: { log: (m: string) => void }
): Promise<BasicChallengeCard[]> {
  const result = await page.evaluate((baseUrl) => {
    const normalize = (v: string) => v.replace(/\s+/g, " ").trim();
    const rows: Array<{ id: string; name: string; url: string; category?: string; activeFrom?: string; activeTo?: string }> = [];
    const seen = new Set<string>();
    let skippedAfterEnded = 0;
    const endedHeading = Array.from(document.querySelectorAll("h3.title, h3[class*='title'], h2.title, h2[class*='title']"))
      .find((el) => /skon[čc]en[eéě]\s+v[ýy]zv/i.test((el.textContent ?? "").trim())) ?? null;
    let currentCategory: string | undefined;
    let stopped = false;
    for (const el of Array.from(document.querySelectorAll("h2, h3, h4, div.column.is-3"))) {
      if (stopped) break;
      if (el.tagName === "H2" || el.tagName === "H3" || el.tagName === "H4") {
        const text = normalize(el.textContent ?? "").trim();
        if (/skon[čc]en[eéě]\s+v[ýy]zv/i.test(text)) { stopped = true; break; }
        if (/nov[eéě]\s+v[ýy]zv|star[eéě]\s+v[ýy]zv/i.test(text)) continue;
        currentCategory = text.replace(/\s*\(\d+\)\s*$/, "").trim() || undefined;
        continue;
      }
      if (endedHeading && endedHeading.compareDocumentPosition(el) & 4) { skippedAfterEnded++; continue; }
      const link = el.querySelector("a[href*='/challenge/']");
      if (!link) continue;
      const href = link.getAttribute("href") ?? "";
      const absoluteUrl = new URL(href, baseUrl).toString();
      const idMatch = absoluteUrl.match(/\/challenge\/(.+?)(?:\?|#|$)/i);
      const id = idMatch?.[1];
      if (!id || seen.has(id)) continue;
      const titleEl = el.querySelector("p.overlay-text, .overlay-text") ?? el.querySelector("h1, h2, h3, h4, p.title, .title, .card-title");
      const name = normalize(titleEl?.textContent ?? link.textContent ?? "");
      if (name.length < 3 || name.length > 160) continue;
      const cardText = el.textContent ?? "";
      const dateMatches = [...cardText.matchAll(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/g)];
      let activeFrom: string | undefined;
      let activeTo: string | undefined;
      if (dateMatches[0]) { const [, d, m, y] = dateMatches[0]; activeFrom = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`; }
      if (dateMatches[1]) { const [, d, m, y] = dateMatches[1]; activeTo = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`; }
      seen.add(id);
      rows.push({ id, name, url: absoluteUrl, category: currentCategory, activeFrom, activeTo });
    }
    return { rows, skippedAfterEnded, totalColumns: document.querySelectorAll("div.column.is-3").length, endedHeadingFound: endedHeading?.textContent?.trim() ?? null };
  }, CHALLENGES_URL);

  logger.log(
    `extractChallengeCards: columns=${result.totalColumns}, collected=${result.rows.length}, skippedAfterEnded=${result.skippedAfterEnded}, endedHeading="${result.endedHeadingFound ?? "not found"}"`
  );
  return result.rows.sort((a, b) => a.name.localeCompare(b.name, "cs"));
}
