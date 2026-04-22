import { chromium } from "playwright";
import { resolveHoryCredentials } from "../../lib/hory-auth";
import { gotoWithRetry } from "../../lib/playwright";
import { HoryAuthError, HoryCacheNotFoundError, HoryValidationError } from "./errors";
import { LOGIN_URL, CHALLENGES_URL, performLogin, readLoginError } from "./challenges/login";
import { buildPeakIndex, readAllPeaksCache } from "./challenges/peaks";
import { normalizeText, waitForChallengeContent, extractChallengeCardsWithLog, collectChallengeDebugInfo } from "./challenges/scraper";
import { crawlChallengeDetails } from "./challenges/detail";
import { type ScrapeChallengesOptions, type ScrapeResult, createRunLogger } from "./challenges/types";
import { readChallengesCache, writeChallengesCache, CHALLENGES_CACHE_PATH } from "./challenges/cache";

export type { ScrapeChallengesOptions, ScrapeResult };
export { readChallengesCache, writeChallengesCache };

const DETAIL_BATCH_SIZE = 6;
const DETAIL_THROTTLE_MS = 700;

// ── HoryChallengesService ──────────────────────────────────────────────────────

export class HoryChallengesService {
  async scrape(options: ScrapeChallengesOptions): Promise<ScrapeResult> {
    const runId = Math.random().toString(36).slice(2, 8);
    const logger = createRunLogger(`[challenges:${runId}]`);

    const credentials = resolveHoryCredentials(options.username, options.password);
    const useCache = options.useCache !== false;
    const refreshCache = options.refreshCache === true;
    const cacheOnly = options.cacheOnly === true;
    const maxChallenges = Number.isFinite(options.maxChallenges) ? Math.max(1, Number(options.maxChallenges)) : undefined;
    const batchSize = Number.isFinite(options.batchSize) ? Math.max(1, Number(options.batchSize)) : DETAIL_BATCH_SIZE;
    const throttleMs = Number.isFinite(options.throttleMs) ? Math.max(0, Number(options.throttleMs)) : DETAIL_THROTTLE_MS;

    logger.log(`Request started: useCache=${useCache}, refreshCache=${refreshCache}, cacheOnly=${cacheOnly}, maxChallenges=${maxChallenges ?? "all"}`);

    if (useCache && !refreshCache) {
      const cached = await readChallengesCache();
      if (cached && cached.challenges.length > 0) {
        logger.log(`Cache hit: challenges=${cached.challenges.length}, cachedAt=${cached.cachedAt}`);
        return { sourceUrl: cached.sourceUrl, pageTitle: `${cached.pageTitle} (cache)`, scrapedAt: cached.cachedAt, challenges: cached.challenges, count: cached.challenges.length, cached: true };
      }
      if (cacheOnly) {
        logger.log("Cache-only mode: cache miss.");
        throw new HoryCacheNotFoundError("Cache výzev zatím není dostupná.");
      }
    }

    if (!credentials.username || !credentials.password) {
      logger.log("Missing credentials and no usable cache.");
      throw new HoryValidationError("Chybí login nebo heslo (a cache výzev není dostupná).");
    }

    logger.log("Loading peaks cache for GPX mapping.");
    const peakIndex = buildPeakIndex(await readAllPeaksCache(normalizeText));
    logger.log(`Peak index ready: ${peakIndex.peaks.length} vrcholů.`);
    logger.log("Launching browser.");
    const browser = await chromium.launch({ headless: true });

    try {
      const context = await browser.newContext();
      const page = await context.newPage();

      logger.log("Opening login page.");
      await gotoWithRetry(page, LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 90_000 });
      logger.log("Submitting login form.");
      await performLogin(page, credentials.username, credentials.password);

      await Promise.race([
        page.waitForURL((url) => !url.toString().includes("/login"), { timeout: 12_000 }),
        page.waitForLoadState("networkidle", { timeout: 12_000 }),
      ]);

      if (page.url().includes("/login")) {
        const loginError = await readLoginError(page);
        logger.log(`Login failed. ${loginError ? `Message="${loginError}"` : "No visible message."}`);
        throw new HoryAuthError(loginError ? `Přihlášení selhalo: ${loginError}` : "Přihlášení pravděpodobně selhalo. Zkontroluj login/heslo.");
      }

      logger.log(`Login success, current URL: ${page.url()}`);
      await page.goto(CHALLENGES_URL, { waitUntil: "domcontentloaded", timeout: 90_000 });
      await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => null);
      await waitForChallengeContent(page, logger);
      const debugInfo = await collectChallengeDebugInfo(page);
      logger.log(`Body sample: ${JSON.stringify(debugInfo.bodySample)}`);
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
        await writeChallengesCache({ cachedAt: scrapedAt, sourceUrl: CHALLENGES_URL, pageTitle, challenges });
        logger.log(`Cache written: ${CHALLENGES_CACHE_PATH}`);
      }

      return { sourceUrl: CHALLENGES_URL, pageTitle, scrapedAt, challenges, count: challenges.length, cached: false, cacheRefreshed: refreshCache };
    } finally {
      logger.log("Closing browser.");
      await browser.close();
    }
  }
}
