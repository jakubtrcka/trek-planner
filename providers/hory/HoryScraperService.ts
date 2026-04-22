import { chromium, Page, Response } from "playwright";
import { gotoWithRetry } from "../../lib/playwright";
import { HoryAuthError, HoryValidationError } from "./errors";
import {
  HoryMapPointSchema,
  HoryRangeSchema,
  ScrapeRangesResultSchema,
} from "./schemas";

// ─── Public interfaces ────────────────────────────────────────────────────────

export interface HoryCredentials {
  username: string;
  password: string;
}

export interface HoryRange {
  name: string;
  url: string;
}

export interface HoryMapPoint {
  lat: number;
  lon: number;
  name?: string;
  peakName?: string;
  altitude?: number | string;
  mountainLink?: string;
  source?: string;
}

export interface ScrapeRangesResult {
  sourceUrl: string;
  pageTitle: string;
  scrapedAt: string;
  ranges: HoryRange[];
  count: number;
}

export interface ScrapeMapPointsResult {
  points: HoryMapPoint[];
  scannedRangePages: number;
}

export interface ScrapeMapPointsOptions {
  targetUrl: string;
  crawlRanges?: boolean;
  maxRanges?: number;
  startsWithLetters?: string[];
  letterMode?: "strict" | "prefer";
  selectedAreaUrls?: string[];
}

// ─── Internal types ───────────────────────────────────────────────────────────

type CandidateSource = {
  url: string;
  contentType: string;
};

// ─── Service class ────────────────────────────────────────────────────────────

export class HoryScraperService {
  private static readonly LOGIN_URL = "https://cs.hory.app/login";

  private static readonly USER_SELECTORS = [
    'input[type="email"]',
    'input[name="email"]',
    'input[name="username"]',
    'input[name="login"]',
    'input[autocomplete="username"]',
    'input[type="text"]',
  ];

  private static readonly PASS_SELECTORS = [
    'input[type="password"]',
    'input[name="password"]',
    'input[autocomplete="current-password"]',
  ];

  private static readonly SUBMIT_SELECTORS = [
    'button[type="submit"]',
    'input[type="submit"]',
    'button:has-text("Přihlásit")',
    'button:has-text("Přihlášení")',
    'button:has-text("Login")',
  ];

  private static readonly CZECH_SUBSTITUTION_TABLE: Record<string, string> = {
    A: "A", Á: "A",
    B: "B",
    C: "C", Č: "Č",
    D: "D", Ď: "Ď",
    E: "E", É: "E", Ě: "E",
    F: "F",
    G: "G",
    H: "H",
    I: "I", Í: "I",
    J: "J",
    K: "K",
    L: "L",
    M: "M",
    N: "N", Ň: "Ň",
    O: "O", Ó: "O",
    P: "P",
    Q: "Q",
    R: "R", Ř: "Ř",
    S: "S", Š: "Š",
    T: "T", Ť: "Ť",
    U: "U", Ú: "U", Ů: "U",
    V: "V",
    W: "W",
    X: "X",
    Y: "Y", Ý: "Y",
    Z: "Z", Ž: "Ž",
  };

  constructor(private readonly credentials: HoryCredentials) {}

  // ─── Public methods ─────────────────────────────────────────────────────────

  async scrapeRanges(targetUrl: string): Promise<ScrapeRangesResult> {
    const { username, password } = this.credentials;

    let parsedTarget: URL;
    try {
      parsedTarget = new URL(targetUrl);
    } catch {
      throw new HoryValidationError("Neplatná cílová URL.");
    }

    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext();
      const page = await context.newPage();

      await this.login(page, username, password);

      await page.goto(parsedTarget.toString(), { waitUntil: "domcontentloaded", timeout: 45_000 });
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => null);

      const ranges = await this.extractRanges(page, parsedTarget.toString());
      const pageTitle = await page.title();

      const result: ScrapeRangesResult = {
        sourceUrl: parsedTarget.toString(),
        pageTitle,
        scrapedAt: new Date().toISOString(),
        ranges: ranges.map((r) => HoryRangeSchema.parse(r)),
        count: ranges.length,
      };

      return ScrapeRangesResultSchema.parse(result);
    } finally {
      await browser.close();
    }
  }

  async scrapeMapPoints(options: ScrapeMapPointsOptions): Promise<ScrapeMapPointsResult> {
    const {
      targetUrl,
      crawlRanges = true,
      maxRanges: maxRangesRaw = 120,
      startsWithLetters = [],
      letterMode = "strict",
      selectedAreaUrls: selectedAreaUrlsRaw = [],
    } = options;

    const runId = Math.random().toString(36).slice(2, 8);
    const logger = this.createRunLogger(`[HoryScraperService:${runId}]`);
    const maxRanges = Math.max(1, Math.min(300, maxRangesRaw));

    let parsedTarget: URL;
    try {
      parsedTarget = new URL(targetUrl);
    } catch {
      throw new HoryValidationError("Neplatná cílová URL.");
    }

    const selectedAreaUrls = selectedAreaUrlsRaw
      .map((url) => {
        try {
          return new URL(url, parsedTarget.origin).toString();
        } catch {
          return null;
        }
      })
      .filter((url): url is string => Boolean(url))
      .filter(
        (url) =>
          url.startsWith(parsedTarget.origin) &&
          new URL(url).pathname.toLowerCase().startsWith("/area/")
      );

    const { username, password } = this.credentials;
    if (!username || !password) {
      throw new HoryAuthError("Chybí login nebo heslo.");
    }

    logger.log(
      `Scraping: target=${targetUrl}, crawlRanges=${crawlRanges}, maxRanges=${maxRanges}, ` +
        `letters=${startsWithLetters.join(",") || "-"}, letterMode=${letterMode}`
    );

    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext();
      const page = await context.newPage();

      logger.log("Opening login page.");
      await this.login(page, username, password);
      logger.log(`Login success, current URL: ${page.url()}`);

      let points: HoryMapPoint[] = [];
      const sources: CandidateSource[] = [];
      let scannedRangePages = 0;

      if (selectedAreaUrls.length === 0) {
        logger.log("Collecting points from target page.");
        const primary = await this.extractMapPoints(page, parsedTarget.toString());
        points = HoryScraperService.withPageSource(primary.points, parsedTarget.toString());
        sources.push(...primary.sources);
        logger.log(`Target page done: points=${points.length}, sources=${sources.length}`);
      } else {
        logger.log("Skipping target page collection because selected areas were provided.");
      }

      const isCountryPage = parsedTarget.pathname.toLowerCase().includes("/country/");

      if (selectedAreaUrls.length > 0) {
        logger.log(`Using selected areas: ${selectedAreaUrls.length} URL(s).`);
        for (const [index, rangeUrl] of selectedAreaUrls.entries()) {
          try {
            scannedRangePages += 1;
            logger.log(`Selected area ${index + 1}/${selectedAreaUrls.length}: ${rangeUrl}`);
            const rangeResult = await this.extractMapPoints(page, rangeUrl);
            const pointsBefore = points.length;
            points.push(...HoryScraperService.withPageSource(rangeResult.points, rangeUrl));
            sources.push(...rangeResult.sources);
            points = HoryScraperService.dedupePoints(points);
            logger.log(
              `Selected area done: added=${points.length - pointsBefore}, total=${points.length}`
            );
          } catch {
            logger.log(`Selected area failed, skipping: ${rangeUrl}`);
          }
        }
      } else if (crawlRanges && isCountryPage) {
        const rangeLinks = await this.extractRangeLinks(page, parsedTarget.toString());
        logger.log(
          `Country page detected: found ${rangeLinks.length} area links, scanning up to ${maxRanges}.`
        );

        for (const [index, rangeUrl] of rangeLinks.slice(0, maxRanges).entries()) {
          try {
            scannedRangePages += 1;
            logger.log(`Range ${index + 1}/${Math.min(rangeLinks.length, maxRanges)}: ${rangeUrl}`);
            const rangeResult = await this.extractMapPoints(page, rangeUrl);
            const pointsBefore = points.length;
            points.push(...HoryScraperService.withPageSource(rangeResult.points, rangeUrl));
            sources.push(...rangeResult.sources);
            points = HoryScraperService.dedupePoints(points);
            logger.log(
              `Range done: added=${points.length - pointsBefore}, total=${points.length}`
            );
          } catch {
            logger.log(`Range failed, skipping: ${rangeUrl}`);
          }
        }
      }

      points = HoryScraperService.dedupePoints(points);
      const namedPoints = HoryScraperService.filterNamedPeaks(points);
      let result = HoryScraperService.filterPointsByLetters(namedPoints, startsWithLetters, letterMode);

      logger.log(`Finished: totalPoints=${result.length}, scannedRangePages=${scannedRangePages}`);

      return {
        points: result.map((p) => HoryMapPointSchema.parse(p)),
        scannedRangePages,
      };
    } finally {
      logger.log("Closing browser.");
      await browser.close();
    }
  }

  // ─── Private methods ────────────────────────────────────────────────────────

  private async login(page: Page, username: string, password: string): Promise<void> {
    await gotoWithRetry(page, HoryScraperService.LOGIN_URL, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });

    await HoryScraperService.fillFirstAvailable(page, HoryScraperService.USER_SELECTORS, username);
    await HoryScraperService.fillFirstAvailable(page, HoryScraperService.PASS_SELECTORS, password);
    await HoryScraperService.submitLogin(page);

    await Promise.race([
      page.waitForURL((url) => !url.toString().includes("/login"), { timeout: 12_000 }),
      page.waitForLoadState("networkidle", { timeout: 12_000 }),
    ]);

    if (page.url().includes("/login")) {
      const loginError = await HoryScraperService.readLoginError(page);
      throw new HoryAuthError(
        loginError
          ? `Přihlášení selhalo: ${loginError}`
          : "Přihlášení pravděpodobně selhalo. Zkontroluj login/heslo."
      );
    }
  }

  private async extractRanges(page: Page, sourceUrl: string): Promise<HoryRange[]> {
    const origin = new URL(sourceUrl).origin;

    const data = await page.evaluate((baseOrigin: string) => {
      const anchorNodes =
        document.querySelectorAll("main a[href]").length > 0
          ? Array.from(document.querySelectorAll("main a[href]"))
          : Array.from(document.querySelectorAll("a[href]"));

      const raw = anchorNodes
        .map((a) => {
          const text = (a.textContent || "").trim().replace(/\s+/g, " ");
          const href = a.getAttribute("href") || "";

          if (!text || !href) {
            return null;
          }

          try {
            const absolute = new URL(href, baseOrigin);
            return {
              name: text,
              url: absolute.toString(),
              path: absolute.pathname.toLowerCase(),
            };
          } catch {
            return null;
          }
        })
        .filter(
          (item): item is { name: string; url: string; path: string } => item !== null
        )
        .filter((item) => {
          if (item.name.length < 2) return false;
          if (!item.url.startsWith(baseOrigin)) return false;
          return item.path.startsWith("/area/");
        });

      const unique = new Map<string, { name: string; url: string }>();
      for (const item of raw) {
        if (!unique.has(item.url)) {
          unique.set(item.url, { name: item.name, url: item.url });
        }
      }

      return Array.from(unique.values());
    }, origin);

    return data;
  }

  private async extractMapPoints(
    page: Page,
    targetUrl: string
  ): Promise<{ points: HoryMapPoint[]; sources: CandidateSource[] }> {
    const captured = new Map<string, { contentType: string; body: string }>();

    const onResponse = async (response: Response) => {
      try {
        const url = response.url();
        const contentType = (response.headers()["content-type"] || "").toLowerCase();
        const resourceType = response.request().resourceType();

        if (!["xhr", "fetch"].includes(resourceType)) return;

        const text = await response.text();
        if (!text || text.length > 2_000_000) return;

        const maybeJson = text.trim();
        if (!maybeJson.startsWith("{") && !maybeJson.startsWith("[")) return;

        captured.set(url, { contentType, body: text });
      } catch {
        // Response can disappear during navigation; ignore.
      }
    };

    page.on("response", onResponse);
    try {
      await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => null);

      await HoryScraperService.triggerMapActivity(page);
      await page.waitForTimeout(1200);

      const points: HoryMapPoint[] = await HoryScraperService.extractClientSidePoints(page);
      const sources: CandidateSource[] = [];

      for (const [url, payload] of captured.entries()) {
        let data: unknown;
        try {
          data = JSON.parse(payload.body);
        } catch {
          continue;
        }

        const fromGeoJson = HoryScraperService.extractGeoJsonPoints(data, url);
        const fromLatLon = HoryScraperService.extractLatLonPairs(data, url);
        const all = HoryScraperService.dedupePoints([...fromGeoJson, ...fromLatLon]);

        if (all.length > 0) {
          points.push(...all);
          sources.push({ url, contentType: payload.contentType });
        }
      }

      return { points: HoryScraperService.dedupePoints(points), sources };
    } finally {
      page.off("response", onResponse);
    }
  }

  private async extractRangeLinks(page: Page, sourceUrl: string): Promise<string[]> {
    const origin = new URL(sourceUrl).origin;
    const links = await page.evaluate((baseOrigin: string) => {
      const anchors = Array.from(document.querySelectorAll("main a[href], a[href]"));
      const out: string[] = [];

      for (const a of anchors) {
        const href = a.getAttribute("href");
        if (!href) continue;

        try {
          const absolute = new URL(href, baseOrigin);
          const urlPath = absolute.pathname.toLowerCase();
          const text = (a.textContent || "").trim();

          if (!absolute.toString().startsWith(baseOrigin)) continue;
          if (
            urlPath.includes("/country/") ||
            urlPath.includes("/login") ||
            urlPath.includes("/register")
          )
            continue;
          if (!urlPath.startsWith("/area/")) continue;
          if (text.length < 2) continue;

          out.push(absolute.toString());
        } catch {
          // Ignore invalid URLs
        }
      }

      return out;
    }, origin);

    return Array.from(new Set(links));
  }

  private createRunLogger(prefix: string) {
    const startedAt = Date.now();
    return {
      log: (message: string) => {
        const elapsed = Date.now() - startedAt;
        console.log(`${prefix} +${elapsed}ms ${message}`);
      },
    };
  }

  // ─── Static helpers ─────────────────────────────────────────────────────────

  private static isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
  }

  private static normalizePoint(point: HoryMapPoint): HoryMapPoint | null {
    if (
      !HoryScraperService.isFiniteNumber(point.lat) ||
      !HoryScraperService.isFiniteNumber(point.lon)
    ) {
      return null;
    }

    if (
      point.lat < -90 ||
      point.lat > 90 ||
      point.lon < -180 ||
      point.lon > 180
    ) {
      return null;
    }

    return {
      lat: Number(point.lat.toFixed(7)),
      lon: Number(point.lon.toFixed(7)),
      name: point.name?.trim() || undefined,
      peakName: point.peakName?.trim() || undefined,
      altitude: point.altitude,
      mountainLink: point.mountainLink,
      source: point.source,
    };
  }

  private static filterNamedPeaks(points: HoryMapPoint[]): HoryMapPoint[] {
    return points.filter((point) => {
      const title = (point.peakName ?? point.name ?? "").trim();
      return title.length > 0;
    });
  }

  private static dedupePoints(points: HoryMapPoint[]): HoryMapPoint[] {
    const unique = new Map<string, HoryMapPoint>();

    for (const point of points) {
      const key = `${point.lat}:${point.lon}`;
      if (!unique.has(key)) {
        unique.set(key, point);
        continue;
      }

      const current = unique.get(key)!;
      const nextHasPeak = Boolean(point.peakName || point.name);
      const currentHasPeak = Boolean(current.peakName || current.name);

      if (nextHasPeak && !currentHasPeak) {
        unique.set(key, point);
        continue;
      }

      if (nextHasPeak && currentHasPeak) {
        unique.set(key, {
          ...current,
          ...point,
          peakName: point.peakName ?? current.peakName,
          name: point.name ?? current.name,
          altitude: point.altitude ?? current.altitude,
          mountainLink: point.mountainLink ?? current.mountainLink,
          source: point.source ?? current.source,
        });
      }
    }

    return Array.from(unique.values());
  }

  private static withPageSource(points: HoryMapPoint[], pageUrl: string): HoryMapPoint[] {
    return points.map((point) => ({
      ...point,
      source: point.source ? `${pageUrl}#${point.source}` : pageUrl,
    }));
  }

  private static normalizeLetter(value: string): string {
    const upper = value.toUpperCase().slice(0, 1);
    return HoryScraperService.CZECH_SUBSTITUTION_TABLE[upper] || upper;
  }

  private static firstLetterFromName(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) return null;

    for (const ch of trimmed) {
      if (/[A-Za-zÁ-Žá-ž]/.test(ch)) {
        return ch.toUpperCase();
      }
    }

    return null;
  }

  private static filterPointsByLetters(
    points: HoryMapPoint[],
    letters: string[],
    mode: "strict" | "prefer"
  ): HoryMapPoint[] {
    if (mode === "prefer" || letters.length === 0) return points;

    const normalizedTarget = new Set(
      letters.map(HoryScraperService.normalizeLetter).filter(Boolean)
    );
    if (normalizedTarget.size === 0) return points;

    return points.filter((point) => {
      const candidateName = point.peakName ?? point.name;
      if (!candidateName) return false;
      const first = HoryScraperService.firstLetterFromName(candidateName);
      if (!first) return false;
      return normalizedTarget.has(HoryScraperService.normalizeLetter(first));
    });
  }

  private static async fillFirstAvailable(
    page: Page,
    selectors: string[],
    value: string
  ): Promise<void> {
    for (const selector of selectors) {
      const locator = page.locator(selector).first();
      if ((await locator.count()) > 0) {
        await locator.fill(value);
        return;
      }
    }
    throw new Error(`Nenašel jsem vhodné pole (${selectors.join(", ")}).`);
  }

  private static async clickFirstAvailable(
    page: Page,
    selectors: string[]
  ): Promise<void> {
    for (const selector of selectors) {
      const locator = page.locator(selector).first();
      if ((await locator.count()) > 0) {
        await locator.click();
        return;
      }
    }
    throw new Error("Nenašel jsem tlačítko pro přihlášení.");
  }

  private static async submitLogin(page: Page): Promise<void> {
    try {
      await HoryScraperService.clickFirstAvailable(page, HoryScraperService.SUBMIT_SELECTORS);
    } catch {
      // Fallback for forms that submit on Enter only.
    }
    await page.keyboard.press("Enter").catch(() => null);
  }

  private static async readLoginError(page: Page): Promise<string | null> {
    const message = await page
      .evaluate(() => {
        const selectors = [
          '[role="alert"]',
          ".alert",
          ".alert-danger",
          ".error",
          ".invalid-feedback",
          ".text-danger",
        ];
        const nodes = selectors.flatMap((selector) =>
          Array.from(document.querySelectorAll(selector))
        );
        for (const node of nodes) {
          const text = (node.textContent || "").trim().replace(/\s+/g, " ");
          if (text.length >= 4) return text;
        }
        return null;
      })
      .catch(() => null);

    if (!message) return null;
    return message.length > 160 ? `${message.slice(0, 157)}...` : message;
  }

  private static async triggerMapActivity(page: Page): Promise<void> {
    const mapSelector =
      ".leaflet-container, .maplibregl-map, .ol-viewport, [id*='map']";
    const map = page.locator(mapSelector).first();

    if ((await map.count()) === 0) return;

    const box = await map.boundingBox();
    if (!box) return;

    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    await page.mouse.move(x, y);
    await page.mouse.wheel(0, -550);
    await page.waitForTimeout(300);
    await page.mouse.down();
    await page.mouse.move(x + 120, y + 60, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    await page.mouse.wheel(0, 420);
  }

  private static async extractClientSidePoints(page: Page): Promise<HoryMapPoint[]> {
    const rawPoints = await page.evaluate(() => {
      type RawPoint = {
        lat: number;
        lon: number;
        name?: string;
        peakName?: string;
        altitude?: number | string;
        mountainLink?: string;
        source?: string;
      };

      const out: RawPoint[] = [];

      const toNumber = (value: unknown): number | null => {
        if (typeof value === "number") return Number.isFinite(value) ? value : null;
        if (typeof value === "string") {
          const n = Number(value);
          return Number.isFinite(n) ? n : null;
        }
        return null;
      };

      const add = (
        lat: unknown,
        lon: unknown,
        name: unknown,
        source: string,
        extra?: { peakName?: unknown; altitude?: unknown; mountainLink?: unknown }
      ) => {
        const latNum = toNumber(lat);
        const lonNum = toNumber(lon);
        if (latNum === null || lonNum === null) return;
        const peakName =
          typeof extra?.peakName === "string"
            ? extra.peakName
            : typeof name === "string"
              ? name
              : undefined;
        out.push({
          lat: latNum,
          lon: lonNum,
          name: typeof name === "string" ? name : undefined,
          peakName,
          altitude:
            typeof extra?.altitude === "number" || typeof extra?.altitude === "string"
              ? extra.altitude
              : undefined,
          mountainLink:
            typeof extra?.mountainLink === "string" ? extra.mountainLink : undefined,
          source,
        });
      };

      const parseAttrNumber = (value: string | null): number | undefined => {
        if (value === null) return undefined;
        const num = Number(value);
        return Number.isFinite(num) ? num : undefined;
      };

      const attrSelectors = [
        "[data-lat][data-lng]",
        "[data-latitude][data-longitude]",
        "[data-lat][data-lon]",
      ];

      for (const selector of attrSelectors) {
        const nodes = Array.from(document.querySelectorAll(selector));
        for (const node of nodes) {
          const element = node as HTMLElement;
          const lat =
            parseAttrNumber(element.getAttribute("data-lat")) ??
            parseAttrNumber(element.getAttribute("data-latitude"));
          const lon =
            parseAttrNumber(element.getAttribute("data-lng")) ??
            parseAttrNumber(element.getAttribute("data-lon")) ??
            parseAttrNumber(element.getAttribute("data-longitude"));
          const name =
            element.getAttribute("title") ||
            element.getAttribute("aria-label") ||
            undefined;
          add(lat, lon, name, "dom:data-attributes");
        }
      }

      const visited = new WeakSet<object>();
      const looksInteresting = (key: string) =>
        /(map|leaflet|marker|pin|feature|point|store|state|param)/i.test(key);

      const walk = (node: unknown, source: string, depth = 0) => {
        if (depth > 7 || node === null || node === undefined) return;

        if (Array.isArray(node)) {
          if (
            node.length >= 2 &&
            typeof node[0] === "number" &&
            typeof node[1] === "number"
          ) {
            add(node[1], node[0], undefined, source);
          }
          for (const item of node) {
            walk(item, source, depth + 1);
          }
          return;
        }

        if (typeof node !== "object") return;

        const obj = node as Record<string, unknown>;
        if (visited.has(obj)) return;
        visited.add(obj);

        const lat = obj.lat ?? obj.latitude;
        const lon = obj.lng ?? obj.lon ?? obj.longitude;
        const name = obj.name ?? obj.title;
        add(lat, lon, name, source);

        for (const [key, value] of Object.entries(obj)) {
          if (depth <= 1 || looksInteresting(key)) {
            walk(value, `${source}.${key}`, depth + 1);
          }
        }
      };

      const win = window as unknown as Record<string, unknown>;

      // hory.app stores map points in window.PARAMS.areaMountains and visits in window.PARAMS.mapVisits
      const params = win.PARAMS as Record<string, unknown> | undefined;
      if (params) {
        const areaMountains = params.areaMountains;
        if (Array.isArray(areaMountains)) {
          for (const item of areaMountains) {
            if (!item || typeof item !== "object") continue;
            const obj = item as Record<string, unknown>;
            add(obj.latitude, obj.longitude, obj.name, "window.PARAMS.areaMountains", {
              peakName: obj.name,
              altitude: obj.altitude,
              mountainLink: obj.mountainLink,
            });
          }
        }

        const mapVisits = params.mapVisits;
        if (Array.isArray(mapVisits)) {
          for (const item of mapVisits) {
            if (!item || typeof item !== "object") continue;
            const obj = item as Record<string, unknown>;
            add(
              obj.latitude,
              obj.longitude,
              obj.name ?? obj.userName,
              "window.PARAMS.mapVisits"
            );
          }
        }

        const mountain = params.mountain;
        if (mountain && typeof mountain === "object") {
          const m = mountain as Record<string, unknown>;
          add(m.latitude, m.longitude, m.name, "window.PARAMS.mountain");
        }

        walk(params, "window.PARAMS", 0);
      }

      for (const [key, value] of Object.entries(win)) {
        if (looksInteresting(key)) {
          walk(value, `window.${key}`, 0);
        }
      }

      return out;
    });

    const normalized = rawPoints
      .map((point) => HoryScraperService.normalizePoint(point))
      .filter((p): p is HoryMapPoint => p !== null);

    return HoryScraperService.dedupePoints(normalized);
  }

  private static extractGeoJsonPoints(node: unknown, source: string): HoryMapPoint[] {
    if (!node || typeof node !== "object") return [];

    const obj = node as Record<string, unknown>;

    if (obj.type === "FeatureCollection" && Array.isArray(obj.features)) {
      return obj.features.flatMap((feature) =>
        HoryScraperService.extractGeoJsonPoints(feature, source)
      );
    }

    if (obj.type === "Feature") {
      const geometry = obj.geometry as Record<string, unknown> | undefined;
      const properties = obj.properties as Record<string, unknown> | undefined;

      if (!geometry || geometry.type !== "Point" || !Array.isArray(geometry.coordinates)) {
        return [];
      }

      const lon = geometry.coordinates[0];
      const lat = geometry.coordinates[1];
      const name =
        typeof properties?.name === "string"
          ? properties.name
          : typeof properties?.title === "string"
            ? properties.title
            : undefined;

      const normalized = HoryScraperService.normalizePoint({
        lat: Number(lat),
        lon: Number(lon),
        name,
        source,
      });
      return normalized ? [normalized] : [];
    }

    return [];
  }

  private static extractLatLonPairs(
    node: unknown,
    source: string,
    depth = 0
  ): HoryMapPoint[] {
    if (depth > 8 || node === null || node === undefined) return [];

    if (Array.isArray(node)) {
      const out: HoryMapPoint[] = [];

      if (
        node.length >= 2 &&
        HoryScraperService.isFiniteNumber(node[0]) &&
        HoryScraperService.isFiniteNumber(node[1])
      ) {
        const maybeLon = Number(node[0]);
        const maybeLat = Number(node[1]);
        const normalized = HoryScraperService.normalizePoint({
          lat: maybeLat,
          lon: maybeLon,
          source,
        });
        if (normalized) out.push(normalized);
      }

      for (const value of node) {
        out.push(...HoryScraperService.extractLatLonPairs(value, source, depth + 1));
      }

      return out;
    }

    if (typeof node !== "object") return [];

    const obj = node as Record<string, unknown>;

    const candidateLat = obj.lat ?? obj.latitude;
    const candidateLon = obj.lng ?? obj.lon ?? obj.longitude;
    const candidateName = obj.name ?? obj.title;

    const points: HoryMapPoint[] = [];

    if (typeof candidateLat === "number" && typeof candidateLon === "number") {
      const normalized = HoryScraperService.normalizePoint({
        lat: candidateLat,
        lon: candidateLon,
        name: typeof candidateName === "string" ? candidateName : undefined,
        source,
      });
      if (normalized) points.push(normalized);
    }

    for (const value of Object.values(obj)) {
      points.push(...HoryScraperService.extractLatLonPairs(value, source, depth + 1));
    }

    return points;
  }
}
