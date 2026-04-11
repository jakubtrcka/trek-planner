import { chromium, Page } from "playwright";
import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveHoryCredentials } from "../../../lib/hory-auth";
import { gotoWithRetry } from "../../../lib/playwright";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequestPayload = {
  username?: string;
  password?: string;
  useCache?: boolean;
  refreshCache?: boolean;
  cacheOnly?: boolean;
  maxChallenges?: number;
  batchSize?: number;
  throttleMs?: number;
};

type ChallengeType = "specific-list" | "property-based" | "crossword" | "unknown";

type ChallengeLevel = {
  level: number;
  total: number;      // peaks needed to complete this level (threshold)
  peakIds: number[];  // peaks specific to this level; empty = uses the challenge's shared pool
};

type ChallengeItem = {
  id: string;
  name: string;
  url: string;
  category?: string;
  activeFrom?: string;
  activeTo?: string;
  rulesText: string;
  rulesHtml?: string;
  gpxUrl?: string;
  isSpecificList: boolean;
  isCrossword?: boolean;
  challengeType?: ChallengeType;
  peakIds?: number[];
  levels?: ChallengeLevel[];
  rawGpxData?: string;
  isEnded?: boolean;
};

type ChallengesCachePayload = {
  cachedAt: string;
  sourceUrl: string;
  pageTitle: string;
  challenges: ChallengeItem[];
};

type PeakCachePoint = {
  lat: number;
  lon: number;
  name?: string;
  peakName?: string;
  mountainLink?: string;
};

type PeaksCachePayload = {
  points: PeakCachePoint[];
};

type Waypoint = {
  name: string;
  lat: number | null;
  lon: number | null;
};

type PeakCandidate = {
  id: number;
  normalizedName: string;
  name: string;
  lat: number;
  lon: number;
};

type BasicChallengeCard = {
  id: string;
  name: string;
  url: string;
  category?: string;
  activeFrom?: string;
  activeTo?: string;
};

const LOGIN_URL = "https://cs.hory.app/login";
const CHALLENGES_URL = "https://cs.hory.app/challenges";
const CACHE_DIR = path.join(process.cwd(), "data", "points-cache");
const CHALLENGES_CACHE_PATH = path.join(CACHE_DIR, "all-challenges.json");
const ALL_PEAKS_CACHE_PATH = path.join(CACHE_DIR, "all-peaks.json");
const DETAIL_BATCH_SIZE = 6;
const DETAIL_THROTTLE_MS = 700;
const DETAIL_BATCH_PAUSE_MS = 1800;
const MATCH_DISTANCE_LIMIT_METERS = 250;

const USER_SELECTORS = [
  'input[type="email"]',
  'input[name="email"]',
  'input[name="username"]',
  'input[name="login"]',
  'input[autocomplete="username"]',
  'input[type="text"]'
];

const PASS_SELECTORS = [
  'input[type="password"]',
  'input[name="password"]',
  'input[autocomplete="current-password"]'
];

const SUBMIT_SELECTORS = [
  'button[type="submit"]',
  'input[type="submit"]',
  'button:has-text("Přihlásit")',
  'button:has-text("Přihlášení")',
  'button:has-text("Login")'
];

function createRunLogger(prefix: string) {
  const startedAt = Date.now();
  return {
    log: (message: string) => {
      const elapsed = Date.now() - startedAt;
      console.log(`${prefix} +${elapsed}ms ${message}`);
    }
  };
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&nbsp;/g, " ")
    .replace(/[^\p{L}\p{N}\s.-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCharCode(parseInt(code, 16)));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseChallengeIdFromUrl(url: string): string {
  const match = url.match(/\/challenge\/(.+?)(?:\?|#|$)/i);
  return match?.[1] ?? url;
}

function parsePeakIdFromMountainLink(url: string | undefined): number | null {
  if (!url) {
    return null;
  }

  const match = url.match(/\/mountain\/(\d+)/i);
  if (!match) {
    return null;
  }

  const id = Number(match[1]);
  return Number.isFinite(id) ? id : null;
}

function absoluteChallengeUrl(href: string): string {
  return new URL(href, CHALLENGES_URL).toString();
}

function dedupeChallengeItems(challenges: ChallengeItem[]): ChallengeItem[] {
  const unique = new Map<string, ChallengeItem>();

  for (const challenge of challenges) {
    unique.set(challenge.id, challenge);
  }

  return Array.from(unique.values()).sort((a, b) => a.name.localeCompare(b.name, "cs"));
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadius = 6_371_000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
}

function detectChallengeType(name: string, rulesText: string, hasGpx: boolean, peakIds: number[]): ChallengeType {
  const combined = normalizeText(`${name} ${rulesText}`);

  if (/(tajenk|osmism|krizem krazem|prvni pismen)/i.test(combined)) {
    return "crossword";
  }

  if (
    /(<|>| pod | nad | vysk| nadmorsk| nizinar| vysinar| spln.*podmink| libovoln.*vrchol| jakykoliv vrchol| alespon )/i.test(
      combined
    ) && !hasGpx && peakIds.length === 0
  ) {
    return "property-based";
  }

  if (hasGpx || peakIds.length > 0 || /(seznam|vrchol(y|u)|navstiv|zdolej|projdi)/i.test(combined)) {
    return "specific-list";
  }

  return "unknown";
}

function parseGpxWaypoints(rawGpxData: string): Waypoint[] {
  const waypoints: Waypoint[] = [];
  const waypointRegex = /<wpt\b([^>]*)>([\s\S]*?)<\/wpt>/gi;

  for (const match of rawGpxData.matchAll(waypointRegex)) {
    const attrs = match[1] ?? "";
    const inner = match[2] ?? "";
    const latMatch = attrs.match(/\blat=["']([^"']+)["']/i);
    const lonMatch = attrs.match(/\blon=["']([^"']+)["']/i);
    const nameMatch = inner.match(/<name\b[^>]*>([\s\S]*?)<\/name>/i);
    const cdataText = nameMatch?.[1]?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1") ?? "";
    const name = decodeHtmlEntities(cdataText.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());

    waypoints.push({
      name,
      lat: latMatch ? Number(latMatch[1]) : null,
      lon: lonMatch ? Number(lonMatch[1]) : null
    });
  }

  return waypoints.filter(
    (waypoint) =>
      waypoint.name.length > 0 ||
      (typeof waypoint.lat === "number" && Number.isFinite(waypoint.lat) && typeof waypoint.lon === "number" && Number.isFinite(waypoint.lon))
  );
}

async function readChallengesCache(): Promise<ChallengesCachePayload | null> {
  try {
    const raw = await fs.readFile(CHALLENGES_CACHE_PATH, "utf8");
    const parsed = JSON.parse(raw) as ChallengesCachePayload;
    if (!Array.isArray(parsed.challenges)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function writeChallengesCache(payload: ChallengesCachePayload): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(CHALLENGES_CACHE_PATH, JSON.stringify(payload, null, 2), "utf8");
}

async function readAllPeaksCache(): Promise<PeakCandidate[]> {
  try {
    const raw = await fs.readFile(ALL_PEAKS_CACHE_PATH, "utf8");
    const parsed = JSON.parse(raw) as PeaksCachePayload;
    if (!Array.isArray(parsed.points)) {
      return [];
    }

    const peaks: PeakCandidate[] = [];

    for (const point of parsed.points) {
      const id = parsePeakIdFromMountainLink(point.mountainLink);
      const lat = Number(point.lat);
      const lon = Number(point.lon);
      const name = (point.peakName ?? point.name ?? "").trim();

      if (!id || !name || !Number.isFinite(lat) || !Number.isFinite(lon)) {
        continue;
      }

      peaks.push({
        id,
        name,
        normalizedName: normalizeText(name),
        lat,
        lon
      });
    }

    return peaks;
  } catch {
    return [];
  }
}

function buildPeakIndex(peaks: PeakCandidate[]) {
  const byName = new Map<string, PeakCandidate[]>();

  for (const peak of peaks) {
    const current = byName.get(peak.normalizedName) ?? [];
    current.push(peak);
    byName.set(peak.normalizedName, current);
  }

  return { peaks, byName };
}

function pickNearestPeak(candidates: PeakCandidate[], waypoint: Waypoint): PeakCandidate | null {
  if (
    candidates.length === 0 ||
    waypoint.lat === null ||
    waypoint.lon === null ||
    !Number.isFinite(waypoint.lat) ||
    !Number.isFinite(waypoint.lon)
  ) {
    return candidates[0] ?? null;
  }

  let best: PeakCandidate | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const distance = haversineMeters(waypoint.lat, waypoint.lon, candidate.lat, candidate.lon);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }

  return best;
}

function findPeakIdForWaypoint(
  waypoint: Waypoint,
  peakIndex: ReturnType<typeof buildPeakIndex>
): number | null {
  const normalizedName = normalizeText(waypoint.name);

  if (normalizedName) {
    const exact = peakIndex.byName.get(normalizedName);
    if (exact && exact.length > 0) {
      return pickNearestPeak(exact, waypoint)?.id ?? null;
    }

    const relaxedVariants = [
      normalizedName.replace(/\bvrch\b/g, "").trim(),
      normalizedName.replace(/\bhora\b/g, "").trim(),
      normalizedName.replace(/\bkopec\b/g, "").trim()
    ].filter(Boolean);

    for (const variant of relaxedVariants) {
      const variantCandidates = peakIndex.byName.get(variant);
      if (variantCandidates && variantCandidates.length > 0) {
        return pickNearestPeak(variantCandidates, waypoint)?.id ?? null;
      }
    }
  }

  if (
    waypoint.lat !== null &&
    waypoint.lon !== null &&
    Number.isFinite(waypoint.lat) &&
    Number.isFinite(waypoint.lon)
  ) {
    let best: PeakCandidate | null = null;
    let bestDistance = MATCH_DISTANCE_LIMIT_METERS;

    for (const peak of peakIndex.peaks) {
      const distance = haversineMeters(waypoint.lat, waypoint.lon, peak.lat, peak.lon);
      if (distance <= bestDistance) {
        best = peak;
        bestDistance = distance;
      }
    }

    return best?.id ?? null;
  }

  return null;
}

function mapWaypointsToPeakIds(waypoints: Waypoint[], peakIndex: ReturnType<typeof buildPeakIndex>): number[] {
  const peakIds = new Set<number>();

  for (const waypoint of waypoints) {
    const peakId = findPeakIdForWaypoint(waypoint, peakIndex);
    if (peakId) {
      peakIds.add(peakId);
    }
  }

  return Array.from(peakIds).sort((a, b) => a - b);
}

async function fillFirstAvailable(page: Page, selectors: string[], value: string): Promise<void> {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) > 0) {
      await locator.fill(value);
      return;
    }
  }

  throw new Error(`Nenašel jsem vhodné pole (${selectors.join(", ")}).`);
}

async function clickFirstAvailable(page: Page, selectors: string[]): Promise<void> {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) > 0) {
      await locator.click();
      return;
    }
  }

  throw new Error("Nenašel jsem tlačítko pro přihlášení.");
}

async function submitLogin(page: Page): Promise<void> {
  try {
    await clickFirstAvailable(page, SUBMIT_SELECTORS);
  } catch {
    // Some forms submit only on Enter.
  }

  await page.keyboard.press("Enter").catch(() => null);
}

async function readLoginError(page: Page): Promise<string | null> {
  const message = await page
    .evaluate(() => {
      const selectors = ['[role="alert"]', ".alert", ".alert-danger", ".error", ".invalid-feedback", ".text-danger"];

      for (const selector of selectors) {
        for (const node of Array.from(document.querySelectorAll(selector))) {
          const text = (node.textContent || "").trim().replace(/\s+/g, " ");
          if (text.length >= 4) {
            return text;
          }
        }
      }

      return null;
    })
    .catch(() => null);

  if (!message) {
    return null;
  }

  return message.length > 160 ? `${message.slice(0, 157)}...` : message;
}

async function setCheckboxByPhrase(page: Page, phrase: string, checked: boolean): Promise<boolean> {
  const changed = await page
    .evaluate(
      ({ phraseNeedle, checkedTarget }) => {
        const normalize = (value: string) =>
          value
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/\s+/g, " ")
            .trim();

        const needle = normalize(phraseNeedle);
        const candidates = Array.from(document.querySelectorAll("label, .checkbox, .switch, .form-check"));

        for (const candidate of candidates) {
          const text = normalize(candidate.textContent || "");
          if (!text.includes(needle)) {
            continue;
          }

          const input = candidate.querySelector("input[type='checkbox'], input[type='radio']");
          if (!(input instanceof HTMLInputElement)) {
            continue;
          }

          if (input.checked !== checkedTarget) {
            input.click();
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));
            return true;
          }

          return true;
        }

        return false;
      },
      { phraseNeedle: phrase, checkedTarget: checked }
    )
    .catch(() => false);

  if (changed) {
    return true;
  }

  const locator = page.getByLabel(new RegExp(phrase, "i")).first();
  if ((await locator.count().catch(() => 0)) > 0) {
    if (checked) {
      await locator.check().catch(() => null);
    } else {
      await locator.uncheck().catch(() => null);
    }
    return true;
  }

  return false;
}

async function selectCountryOption(page: Page, countryLabel: string): Promise<boolean> {
  const normalizedCountry = normalizeText(countryLabel);

  const selected = await page
    .evaluate((countryNeedle) => {
      const normalize = (value: string) =>
        value
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .replace(/\s+/g, " ")
          .trim();

      for (const select of Array.from(document.querySelectorAll("select"))) {
        if (!(select instanceof HTMLSelectElement)) {
          continue;
        }

        const option = Array.from(select.options).find((item) => normalize(item.textContent || "") === countryNeedle);
        if (!option) {
          continue;
        }

        select.value = option.value;
        select.dispatchEvent(new Event("input", { bubbles: true }));
        select.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }

      return false;
    }, normalizedCountry)
    .catch(() => false);

  if (selected) {
    return true;
  }

  const triggerCandidates = [
    page.getByLabel(/zem[eě]|st[aá]t|country/i).first(),
    page.getByRole("combobox").first()
  ];

  for (const trigger of triggerCandidates) {
    if ((await trigger.count().catch(() => 0)) === 0) {
      continue;
    }

    await trigger.click().catch(() => null);
    const option = page.getByText(/česk[aá] republika|czech republic/i).first();
    if ((await option.count().catch(() => 0)) > 0) {
      await option.click().catch(() => null);
      return true;
    }
  }

  return false;
}

async function applyChallengeFilters(page: Page, logger: { log: (message: string) => void }): Promise<void> {
  logger.log("Applying challenge filters.");

  // Try checkboxes directly first — filters may already be visible without needing a trigger
  let endedHandled = await setCheckboxByPhrase(page, "skončen", false);
  let futureHandled = await setCheckboxByPhrase(page, "budouc", false);

  if (!endedHandled && !futureHandled) {
    // Filters not visible yet — try to open a dedicated filter panel (avoid broad text triggers)
    const filterTriggers = [
      page.getByRole("button", { name: /^filtr/i }).first(),
      page.getByRole("link", { name: /^filtr/i }).first(),
      page.locator("button.filter-toggle, button[data-filter], [data-action*='filter']").first()
    ];

    for (const trigger of filterTriggers) {
      if ((await trigger.count().catch(() => 0)) === 0) {
        continue;
      }
      await trigger.click().catch(() => null);
      await page.waitForTimeout(500);
      logger.log("Filter trigger clicked, retrying checkboxes.");
      endedHandled = await setCheckboxByPhrase(page, "skončen", false);
      futureHandled = await setCheckboxByPhrase(page, "budouc", false);
      break;
    }
  }

  logger.log(
    `Filter controls: ended=${endedHandled ? "ok" : "miss"}, future=${futureHandled ? "ok" : "miss"}`
  );

  if (endedHandled || futureHandled) {
    const submitButton = page.getByRole("button", { name: /pou[zž]ít|potvrdit|zobrazit|filtrovat|ulo[zž]it/i }).first();
    if ((await submitButton.count().catch(() => 0)) > 0) {
      await submitButton.click().catch(() => null);
      logger.log("Filter submit clicked.");
    }
  }

  await page.waitForLoadState("networkidle", { timeout: 12_000 }).catch(() => null);
  await page.waitForTimeout(1200);
}

async function collectChallengeDebugInfo(page: Page): Promise<{
  title: string;
  challengeLinkCount: number;
  overlayTextCount: number;
  cardOverlayLinkCount: number;
  challengeColumnCount: number;
  snippetExists: boolean;
  bodySample: string;
}> {
  return page.evaluate(() => {
    const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
    return {
      title: document.title,
      challengeLinkCount: document.querySelectorAll("a[href*='/challenge/']").length,
      overlayTextCount: document.querySelectorAll(".overlay-text").length,
      cardOverlayLinkCount: document.querySelectorAll("a.card-image-overlay[href*='/challenge/']").length,
      challengeColumnCount: document.querySelectorAll("div.column.is-3").length,
      snippetExists: Boolean(document.querySelector("#snippet-challenges")),
      bodySample: normalize(document.body?.innerText || "").slice(0, 400)
    };
  });
}

async function waitForChallengeContent(page: Page, logger: { log: (message: string) => void }): Promise<void> {
  const checkpoints = [0, 1000, 2500, 5000, 8000];

  for (const delayMs of checkpoints) {
    if (delayMs > 0) {
      await page.waitForTimeout(delayMs);
    }

    const info = await collectChallengeDebugInfo(page);
    logger.log(
      `DOM snapshot: snippet=${info.snippetExists}, columns=${info.challengeColumnCount}, challengeLinks=${info.challengeLinkCount}, cardOverlayLinks=${info.cardOverlayLinkCount}, overlayTexts=${info.overlayTextCount}, title="${info.title}"`
    );

    if (info.cardOverlayLinkCount > 0 || info.overlayTextCount > 0 || info.challengeLinkCount > 0) {
      return;
    }
  }
}

async function scrollToLoadAllChallenges(page: Page, logger: { log: (message: string) => void }): Promise<void> {
  let previousCount = 0;
  let stableRounds = 0;
  const MAX_ROUNDS = 25;

  for (let round = 0; round < MAX_ROUNDS && stableRounds < 2; round++) {
    const currentCount = await page.evaluate(
      () => document.querySelectorAll("a[href*='/challenge/']").length
    );

    if (currentCount === previousCount) {
      stableRounds++;
    } else {
      stableRounds = 0;
      previousCount = currentCount;
    }

    logger.log(`Scroll round ${round + 1}: ${currentCount} challenge links, stable=${stableRounds}`);

    // Scroll to bottom to trigger infinite scroll
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1200);

    // Also click "load more" button if present
    const loadMore = page
      .getByRole("button", { name: /načíst více|zobrazit více|více výzev|load more|show more/i })
      .first();
    if ((await loadMore.count().catch(() => 0)) > 0) {
      await loadMore.click().catch(() => null);
      logger.log("Load-more button clicked.");
      await page.waitForTimeout(1200);
    }

    // Also look for pagination "next" link
    const nextPage = page.locator("a[rel='next'], a.pagination-next, li.next a").first();
    if ((await nextPage.count().catch(() => 0)) > 0) {
      await nextPage.click().catch(() => null);
      logger.log("Pagination next clicked.");
      await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => null);
      await page.waitForTimeout(800);
      stableRounds = 0; // reset — new page loaded
    }
  }

  logger.log(`Scroll done. Final challenge link count: ${previousCount}`);
}

async function extractChallengeCards(page: Page): Promise<BasicChallengeCard[]> {
  const cards = await page.evaluate((baseUrl) => {
    const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
    const rows: Array<{ id: string; name: string; url: string }> = [];
    const seen = new Set<string>();

    // Find the "Skončené výzvy" section heading — everything after it is ended.
    // Match the full phrase to avoid false positives in card text or filter UI.
    const endedHeading = Array.from(document.querySelectorAll("h2, h3, h4")).find((el) =>
      /skon[čc]en[eéě]\s+v[ýy]zv/i.test((el.textContent ?? "").trim())
    ) ?? null;

    const anchors = document.querySelectorAll("a.card-image-overlay[href*='/challenge/'], a[href*='/challenge/']");

    for (const anchor of Array.from(anchors)) {
      // Skip anything that appears after the "Skončené výzvy" heading
      if (endedHeading && (endedHeading.compareDocumentPosition(anchor) & Node.DOCUMENT_POSITION_FOLLOWING)) {
        continue;
      }

      const href = anchor.getAttribute("href") || "";
      if (!href) {
        continue;
      }

      const absoluteUrl = new URL(href, baseUrl).toString();
      const idMatch = absoluteUrl.match(/\/challenge\/([^/?#]+)/i);
      const id = idMatch?.[1];
      if (!id || seen.has(id)) {
        continue;
      }

      const titleNode =
        anchor.querySelector("div.card-hero-text p.overlay-text") ??
        anchor.querySelector(".overlay-text, .title, h1, h2, h3, h4");
      const name = normalize(titleNode?.textContent || anchor.textContent || "");

      if (name.length < 3 || name.length > 160) {
        continue;
      }

      seen.add(id);
      rows.push({ id, name, url: absoluteUrl });
    }

    return { rows, endedHeadingText: endedHeading?.textContent?.trim() ?? null };
  }, CHALLENGES_URL);

  return cards.rows
    .filter((item) => {
      const normalized = normalizeText(item.name);
      return normalized !== "sledovat vyzvu" && normalized !== "prestat sledovat vyzvu";
    })
    .sort((a, b) => a.name.localeCompare(b.name, "cs"));
}

async function extractChallengeCardsWithLog(
  page: Page,
  logger: { log: (message: string) => void }
): Promise<BasicChallengeCard[]> {
  const result = await page.evaluate((baseUrl) => {
    const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
    const rows: Array<{ id: string; name: string; url: string; category?: string; activeFrom?: string; activeTo?: string }> = [];
    const seen = new Set<string>();
    let skippedAfterEnded = 0;

    // Find the exact <h3 class="title is-3">Skončené výzvy …</h3> sentinel
    const endedHeading = Array.from(document.querySelectorAll("h3.title, h3[class*='title'], h2.title, h2[class*='title']")).find(
      (el) => /skon[čc]en[eéě]\s+v[ýy]zv/i.test((el.textContent ?? "").trim())
    ) ?? null;

    // Walk all headings and challenge columns together in document order
    // so we can track the current category section heading as we go.
    const allEls = Array.from(document.querySelectorAll("h2, h3, h4, div.column.is-3"));
    let currentCategory: string | undefined;
    let stopped = false;

    for (const el of allEls) {
      if (stopped) break;

      if (el.tagName === "H2" || el.tagName === "H3" || el.tagName === "H4") {
        const text = normalize(el.textContent ?? "").trim();
        // Stop at "Skončené výzvy"
        if (/skon[čc]en[eéě]\s+v[ýy]zv/i.test(text)) { stopped = true; break; }
        // Skip temporal headings like "Nové výzvy 2026 (23)" — these are not category names
        if (/nov[eéě]\s+v[ýy]zv|star[eéě]\s+v[ýy]zv/i.test(text)) continue;
        // Strip trailing count like "(23)"
        currentCategory = text.replace(/\s*\(\d+\)\s*$/, "").trim() || undefined;
        continue;
      }

      // div.column.is-3
      const col = el;
      if (endedHeading && (endedHeading.compareDocumentPosition(col) & 4 /* FOLLOWING */)) {
        skippedAfterEnded++;
        continue;
      }

      const link = col.querySelector("a[href*='/challenge/']");
      if (!link) continue;

      const href = link.getAttribute("href") ?? "";
      const absoluteUrl = new URL(href, baseUrl).toString();
      const idMatch = absoluteUrl.match(/\/challenge\/(.+?)(?:\?|#|$)/i);
      const id = idMatch?.[1];
      if (!id || seen.has(id)) continue;

      // Title: overlay text inside the card image, or any heading/title element in the column
      const titleEl =
        col.querySelector("p.overlay-text, .overlay-text") ??
        col.querySelector("h1, h2, h3, h4, p.title, .title, .card-title");
      const name = normalize(titleEl?.textContent ?? link.textContent ?? "");
      if (name.length < 3 || name.length > 160) continue;

      // Extract date range from card text (e.g. "1. 1. 2026–31. 12. 2026")
      const cardText = col.textContent ?? "";
      const dateMatches = [...cardText.matchAll(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/g)];
      let activeFrom: string | undefined;
      let activeTo: string | undefined;
      if (dateMatches[0]) {
        const [, d, m, y] = dateMatches[0];
        activeFrom = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
      }
      if (dateMatches[1]) {
        const [, d, m, y] = dateMatches[1];
        activeTo = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
      }

      seen.add(id);
      rows.push({ id, name, url: absoluteUrl, category: currentCategory, activeFrom, activeTo });
    }

    return {
      rows,
      skippedAfterEnded,
      totalColumns: document.querySelectorAll("div.column.is-3").length,
      endedHeadingFound: endedHeading?.textContent?.trim() ?? null,
    };
  }, CHALLENGES_URL);

  logger.log(
    `extractChallengeCards: columns=${result.totalColumns}, collected=${result.rows.length}, skippedAfterEnded=${result.skippedAfterEnded}, endedHeading="${result.endedHeadingFound ?? "not found"}"`
  );

  return result.rows.sort((a, b) => a.name.localeCompare(b.name, "cs"));
}

async function extractChallengeDetail(page: Page, challenge: BasicChallengeCard, peakIndex: ReturnType<typeof buildPeakIndex>) {
  await page.goto(challenge.url, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => null);
  await page.waitForTimeout(400);

  const detail = await page.evaluate(({ challengeUrl, challengeName }: { challengeUrl: string; challengeName: string }) => {
    const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
    const rulesElement = document.querySelector("#rules");
    const rulesText = normalize(rulesElement?.textContent || "");
    const rulesHtml = rulesElement instanceof HTMLElement ? rulesElement.innerHTML.trim() : "";

    // Extract active period ("Doba trvání výzvy")
    function parseCzechDate(d: string, m: string, y: string): string {
      return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
    function extractDatePair(text: string): [string?, string?] {
      const matches = [...text.matchAll(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/g)];
      const from = matches[0] ? parseCzechDate(matches[0][1], matches[0][2], matches[0][3]) : undefined;
      const to = matches[1] ? parseCzechDate(matches[1][1], matches[1][2], matches[1][3]) : undefined;
      return [from, to];
    }
    let activeFrom: string | undefined;
    let activeTo: string | undefined;

    // Strategy 1: <time datetime="YYYY-MM-DD"> elements
    const isoTimes = Array.from(document.querySelectorAll("time[datetime]"))
      .map(el => (el.getAttribute("datetime") ?? "").slice(0, 10))
      .filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s));
    if (isoTimes.length >= 1) activeFrom = isoTimes[0];
    if (isoTimes.length >= 2) activeTo = isoTimes[isoTimes.length - 1];

    // Strategy 2: find any DOM element that contains "Doba trvání" text,
    // then extract dates from that element or its closest box/card ancestor
    if (!activeFrom) {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        if (!/Doba\s+trv[aá]n[íi]/i.test(node.textContent ?? "")) continue;
        // Found the label text node — walk up to find a container with the date
        let container: Element | null = node.parentElement;
        for (let i = 0; i < 5 && container; i++) {
          const [f, t] = extractDatePair(container.textContent ?? "");
          if (f) { activeFrom = f; activeTo = t; break; }
          container = container.parentElement;
        }
        if (activeFrom) break;
      }
    }

    // Strategy 3: innerText scan — handles cases where label and date are on adjacent lines
    if (!activeFrom) {
      const pageText = (document.body?.innerText ?? "").replace(/[ \t]+/g, " ");
      const idx = pageText.search(/Doba\s+trv[aá]n[íi]/i);
      if (idx >= 0) {
        const [f, t] = extractDatePair(pageText.slice(idx, idx + 300));
        activeFrom = f;
        activeTo = t;
      }
    }

    // Strategy 4: any labeled metadata (dt, th, .heading class used by Bulma)
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
      if (!href) {
        continue;
      }

      if (/\.gpx(\?|#|$)/i.test(href) || /stahnout.*gpx|download.*gpx|export.*gpx|gpx/i.test(text)) {
        gpxUrl = new URL(href, challengeUrl).toString();
        break;
      }
    }

    const mountainLinks = Array.from(document.querySelectorAll("a[href*='/mountain/']"))
      .map((anchor) => (anchor instanceof HTMLAnchorElement ? anchor.href : anchor.getAttribute("href") || ""))
      .filter(Boolean);

    // Detect ended status from page content
    const bodyText = (document.body?.textContent ?? "").toLowerCase();
    const endedByText = /výzva skon[čc]ila|výzva je ukon[čc]ena|výzva byla ukon[čc]ena|ukon[čc]ená výzva|challenge.*ended|challenge.*closed/.test(bodyText);

    // Look for a visible "ended" badge or tag (various class patterns hory.app might use)
    const endedByElement = !!(
      document.querySelector('[class*="ended"], [class*="closed"], [class*="ukon"], [class*="finished"]') ??
      document.querySelector('.tag.is-danger, .badge-danger') ??
      Array.from(document.querySelectorAll('.tag, .badge, .label, .chip')).find((el) =>
        /skon[čc]|ukon[čc]|zakon[čc]|ended|closed/i.test(el.textContent ?? "")
      )
    );

    // Also check if there's a date range element showing end date in the past
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

    // Extract category from breadcrumbs (e.g. "Výzvy > Poznej pohoří > Bavorský horal")
    // We want the middle item(s) — skip nav items and the last item (current page = challenge name)
    let category: string | undefined;
    const breadcrumbEls = Array.from(document.querySelectorAll(
      "nav.breadcrumb li, .breadcrumb li, [aria-label='breadcrumb'] li, ol.breadcrumb li"
    ));
    // Collect all candidate texts (skip nav/home, skip last item, skip items matching challenge name)
    const normalizeSimple = (v: string) => v.replace(/\s+/g, " ").trim().toLowerCase();
    const normalizedChallengeName = normalizeSimple(challengeName);
    const candidates: string[] = [];
    for (const item of breadcrumbEls) {
      const text = normalize(item.textContent ?? "").trim();
      if (text.length < 3) continue;
      if (/^v[yý]zv|^dom[uů]|^home|^\//i.test(text)) continue;
      if (normalizeSimple(text) === normalizedChallengeName) continue;
      candidates.push(text);
    }
    // Take the last candidate (most specific category before challenge name)
    if (candidates.length > 0) category = candidates[candidates.length - 1];

    // Detect challenge levels ("1. úroveň", "2. úroveň", …)
    // Strategy: find all text nodes / elements whose trimmed text matches "N. úroveň",
    // then walk up to a column/card container and extract threshold + peaks from it.
    type LevelRaw = { level: number; total: number; peakLinks: string[] };
    const levels: LevelRaw[] = [];
    const seenLevels = new Set<number>();

    // Use TreeWalker to find leaf/near-leaf elements with "N. úroveň" text
    const walker2 = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, {
      acceptNode(node) {
        const el = node as Element;
        // Only consider elements with few children (headings / labels)
        if (el.children.length > 3) return NodeFilter.FILTER_SKIP;
        const text = (el.textContent ?? "").trim();
        return /^\d+\.\s*úrove[ňn]$/i.test(text) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    });

    let levelEl: Node | null;
    while ((levelEl = walker2.nextNode())) {
      const el = levelEl as Element;
      const levelMatch = /^(\d+)/.exec((el.textContent ?? "").trim());
      if (!levelMatch) continue;
      const levelNum = parseInt(levelMatch[1], 10);
      if (seenLevels.has(levelNum)) continue;
      seenLevels.add(levelNum);

      // Walk up to a container (column/card/box/article) to scope this level's content
      let container: Element | null = el.parentElement;
      for (let i = 0; i < 6 && container; i++) {
        const tag = container.tagName.toLowerCase();
        const cls = container.className ?? "";
        if (/column|card|box|article|section/i.test(tag) || /column|card|box|level/i.test(cls)) break;
        container = container.parentElement;
      }
      if (!container) container = el.parentElement;

      // Extract threshold from "X/Y" fraction in this container
      const fractionMatch = (container?.textContent ?? "").match(/\b(\d+)\/(\d+)\b/);
      const total = fractionMatch ? parseInt(fractionMatch[2], 10) : 0;

      // Extract mountain links scoped to this container
      const levelPeakLinks = Array.from(container?.querySelectorAll("a[href*='/mountain/']") ?? [])
        .map(a => (a instanceof HTMLAnchorElement ? a.href : a.getAttribute("href") ?? ""))
        .filter(Boolean);

      if (total > 0 || levelPeakLinks.length > 0) {
        levels.push({ level: levelNum, total, peakLinks: levelPeakLinks });
      }
    }

    return {
      title: document.title,
      rulesText,
      rulesHtml,
      gpxUrl: gpxUrl || undefined,
      mountainLinks,
      isEnded: endedByText || endedByElement || endedByDate,
      category: category || undefined,
      activeFrom: activeFrom || undefined,
      activeTo: activeTo || undefined,
      levels: levels.length > 0 ? levels.sort((a, b) => a.level - b.level) : undefined
    };
  }, { challengeUrl: challenge.url, challengeName: challenge.name });

  let rawGpxData: string | undefined;
  let peakIds: number[] = detail.mountainLinks
    .map((mountainLink) => parsePeakIdFromMountainLink(mountainLink))
    .filter((value): value is number => value !== null);

  if (detail.gpxUrl) {
    const gpxResponse = await page.context().request.get(detail.gpxUrl, { timeout: 30_000 });
    if (gpxResponse.ok()) {
      rawGpxData = await gpxResponse.text();
      const waypoints = parseGpxWaypoints(rawGpxData);
      const gpxPeakIds = mapWaypointsToPeakIds(waypoints, peakIndex);
      peakIds = Array.from(new Set([...peakIds, ...gpxPeakIds])).sort((a, b) => a - b);
    }
  }

  peakIds = Array.from(new Set(peakIds)).sort((a, b) => a - b);
  const challengeType = detectChallengeType(challenge.name, detail.rulesText, Boolean(detail.gpxUrl), peakIds);

  // Process scraped levels — resolve peak IDs per level if they differ from the shared pool
  let levels: ChallengeLevel[] | undefined;
  if (detail.levels && detail.levels.length > 0) {
    levels = detail.levels.map((l) => {
      const levelPeakIds = l.peakLinks
        .map((link) => parsePeakIdFromMountainLink(link))
        .filter((id): id is number => id !== null);
      // If the level's peaks are the same as (or a subset of) the full pool,
      // don't store them separately — use total (threshold) only.
      const uniqueLevelIds = Array.from(new Set(levelPeakIds)).sort((a, b) => a - b);
      const isSamePool = uniqueLevelIds.length === 0 ||
        (uniqueLevelIds.length === peakIds.length && uniqueLevelIds.every((id, i) => id === peakIds[i]));
      return {
        level: l.level,
        total: l.total || uniqueLevelIds.length,
        peakIds: isSamePool ? [] : uniqueLevelIds,
      } satisfies ChallengeLevel;
    });
  }

  return {
    id: challenge.id,
    name: challenge.name,
    url: challenge.url,
    category: challenge.category ?? detail.category,
    activeFrom: challenge.activeFrom ?? detail.activeFrom,
    activeTo: challenge.activeTo ?? detail.activeTo,
    rulesText: detail.rulesText,
    rulesHtml: detail.rulesHtml || undefined,
    gpxUrl: detail.gpxUrl,
    isSpecificList: challengeType === "specific-list",
    isCrossword: challengeType === "crossword",
    challengeType,
    peakIds,
    levels,
    rawGpxData,
    isEnded: detail.isEnded
  } satisfies ChallengeItem;
}

async function crawlChallengeDetails(
  page: Page,
  challengeCards: BasicChallengeCard[],
  peakIndex: ReturnType<typeof buildPeakIndex>,
  logger: { log: (message: string) => void },
  batchSize: number,
  throttleMs: number
): Promise<ChallengeItem[]> {
  const out: ChallengeItem[] = [];

  for (let start = 0; start < challengeCards.length; start += batchSize) {
    const batch = challengeCards.slice(start, start + batchSize);
    logger.log(`Detail batch ${Math.floor(start / batchSize) + 1}: ${batch.length} výzev.`);

    for (const challenge of batch) {
      logger.log(`Detail start: ${challenge.name} (${challenge.url})`);

      try {
        const detail = await extractChallengeDetail(page, challenge, peakIndex);
        logger.log(
          `Detail done: ${challenge.name}, type=${detail.challengeType}, gpx=${detail.gpxUrl ? "yes" : "no"}, peaks=${detail.peakIds?.length ?? 0}, ended=${detail.isEnded ? "yes" : "no"}`
        );
        if (!detail.isEnded) {
          out.push(detail);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown";
        logger.log(`Detail failed: ${challenge.name}, reason=${message}`);
        out.push({
          id: challenge.id,
          name: challenge.name,
          url: challenge.url,
          rulesText: "",
          isSpecificList: false,
          challengeType: "unknown",
          peakIds: []
        });
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

export async function POST(request: Request) {
  const runId = Math.random().toString(36).slice(2, 8);
  const logger = createRunLogger(`[challenges:${runId}]`);
  const body = (await request.json()) as RequestPayload;
  const credentials = resolveHoryCredentials(body.username, body.password);
  const username = credentials.username;
  const password = credentials.password;
  const useCache = body.useCache !== false;
  const refreshCache = body.refreshCache === true;
  const cacheOnly = body.cacheOnly === true;
  const maxChallenges = Number.isFinite(body.maxChallenges) ? Math.max(1, Number(body.maxChallenges)) : undefined;
  const batchSize = Number.isFinite(body.batchSize) ? Math.max(1, Number(body.batchSize)) : DETAIL_BATCH_SIZE;
  const throttleMs = Number.isFinite(body.throttleMs) ? Math.max(0, Number(body.throttleMs)) : DETAIL_THROTTLE_MS;

  logger.log(
    `Request started: useCache=${useCache}, refreshCache=${refreshCache}, cacheOnly=${cacheOnly}, maxChallenges=${maxChallenges ?? "all"}`
  );

  if (useCache && !refreshCache) {
    const cached = await readChallengesCache();
    if (cached && cached.challenges.length > 0) {
      logger.log(`Cache hit: challenges=${cached.challenges.length}, cachedAt=${cached.cachedAt}`);
      return NextResponse.json({
        sourceUrl: cached.sourceUrl,
        pageTitle: `${cached.pageTitle} (cache)`,
        scrapedAt: cached.cachedAt,
        challenges: cached.challenges,
        count: cached.challenges.length,
        cached: true
      });
    }

    if (cacheOnly) {
      logger.log("Cache-only mode: cache miss.");
      return NextResponse.json({ error: "Cache výzev zatím není dostupná." }, { status: 404 });
    }
  }

  if (!username || !password) {
    logger.log("Missing credentials and no usable cache.");
    return NextResponse.json({ error: "Chybí login nebo heslo (a cache výzev není dostupná)." }, { status: 400 });
  }

  logger.log("Loading peaks cache for GPX mapping.");
  const peakIndex = buildPeakIndex(await readAllPeaksCache());
  logger.log(`Peak index ready: ${peakIndex.peaks.length} vrcholů.`);

  logger.log("Launching browser.");
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    logger.log("Opening login page.");
    await gotoWithRetry(page, LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 90_000 });
    logger.log("Submitting login form.");
    await fillFirstAvailable(page, USER_SELECTORS, username);
    await fillFirstAvailable(page, PASS_SELECTORS, password);
    await submitLogin(page);

    await Promise.race([
      page.waitForURL((url) => !url.toString().includes("/login"), { timeout: 12_000 }),
      page.waitForLoadState("networkidle", { timeout: 12_000 })
    ]);

    if (page.url().includes("/login")) {
      const loginError = await readLoginError(page);
      logger.log(`Login failed. ${loginError ? `Message="${loginError}"` : "No visible message."}`);
      return NextResponse.json(
        {
          error: loginError
            ? `Přihlášení selhalo: ${loginError}`
            : "Přihlášení pravděpodobně selhalo. Zkontroluj login/heslo."
        },
        { status: 401 }
      );
    }

    logger.log(`Login success, current URL: ${page.url()}`);
    logger.log(`Opening challenges page: ${CHALLENGES_URL}`);
    await page.goto(CHALLENGES_URL, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => null);
    await waitForChallengeContent(page, logger);
    const debugInfo = await collectChallengeDebugInfo(page);
    logger.log(`Body sample: ${JSON.stringify(debugInfo.bodySample)}`);
    logger.log("Extracting challenge cards.");
    const challengeCards = await extractChallengeCardsWithLog(page, logger);
    logger.log(`Cards extracted: ${challengeCards.length}`);

    const detailPage = await context.newPage();
    const scopedChallenges = maxChallenges ? challengeCards.slice(0, maxChallenges) : challengeCards;
    const challenges = await crawlChallengeDetails(detailPage, scopedChallenges, peakIndex, logger, batchSize, throttleMs);
    await detailPage.close().catch(() => null);

    const pageTitle = await page.title();
    const scrapedAt = new Date().toISOString();
    logger.log(`Extraction finished: challenges=${challenges.length}, pageTitle="${pageTitle}"`);

    if (refreshCache) {
      logger.log(`Writing cache: ${CHALLENGES_CACHE_PATH}`);
      await writeChallengesCache({
        cachedAt: scrapedAt,
        sourceUrl: CHALLENGES_URL,
        pageTitle,
        challenges
      });
      logger.log("Cache write finished.");
    }

    logger.log("Request finished successfully.");
    return NextResponse.json({
      sourceUrl: CHALLENGES_URL,
      pageTitle,
      scrapedAt,
      challenges,
      count: challenges.length,
      cached: false,
      cacheRefreshed: refreshCache
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Neočekávaná chyba při načítání výzev.";
    logger.log(`Failed: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    logger.log("Closing browser.");
    await browser.close();
  }
}
