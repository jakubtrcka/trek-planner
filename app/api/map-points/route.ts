import { chromium, Page, Response } from "playwright";
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
  targetUrl?: string;
  countryCode?: string;
  crawlRanges?: boolean;
  maxRanges?: number;
  startsWithLetters?: string[];
  letterMode?: "strict" | "prefer";
  selectedAreaUrls?: string[];
  useCache?: boolean;
  refreshAllCache?: boolean;
  cacheOnly?: boolean;
};

type MapPoint = {
  lat: number;
  lon: number;
  name?: string;
  peakName?: string;
  altitude?: number | string;
  mountainLink?: string;
  source?: string;
};

type CandidateSource = {
  url: string;
  contentType: string;
};

const LOGIN_URL = "https://cs.hory.app/login";

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

const CACHE_DIR = path.join(process.cwd(), "data", "points-cache");
const ALL_PEAKS_CACHE_PATH = path.join(CACHE_DIR, "all-peaks.json");

// Map from country URL slug to short country code used for cache filenames.
const COUNTRY_URL_TO_CODE: Record<string, string> = {
  "czech-republic": "cz",
  "slovenia": "si",
};

function countryCodeFromTargetUrl(url: string): string {
  try {
    const slug = new URL(url).pathname.toLowerCase().split("/country/")[1]?.split("/")[0] ?? "";
    return COUNTRY_URL_TO_CODE[slug] ?? (slug || "cz");
  } catch {
    return "cz";
  }
}

function getCachePathForCountry(code: string): string {
  // For Czech Republic, also try the legacy all-peaks.json as a fallback.
  return path.join(CACHE_DIR, `all-peaks-${code}.json`);
}

type PeaksCachePayload = {
  cachedAt: string;
  sourceUrl: string;
  pageTitle: string;
  points: MapPoint[];
  scannedRangePages: number;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizePoint(point: MapPoint): MapPoint | null {
  if (!isFiniteNumber(point.lat) || !isFiniteNumber(point.lon)) {
    return null;
  }

  if (point.lat < -90 || point.lat > 90 || point.lon < -180 || point.lon > 180) {
    return null;
  }

  return {
    lat: Number(point.lat.toFixed(7)),
    lon: Number(point.lon.toFixed(7)),
    name: point.name?.trim() || undefined,
    peakName: point.peakName?.trim() || undefined,
    altitude: point.altitude,
    mountainLink: point.mountainLink,
    source: point.source
  };
}

function filterNamedPeaks(points: MapPoint[]): MapPoint[] {
  return points.filter((point) => {
    const title = (point.peakName ?? point.name ?? "").trim();
    return title.length > 0;
  });
}

function extractGeoJsonPoints(node: unknown, source: string): MapPoint[] {
  if (!node || typeof node !== "object") {
    return [];
  }

  const obj = node as Record<string, unknown>;

  if (obj.type === "FeatureCollection" && Array.isArray(obj.features)) {
    return obj.features.flatMap((feature) => extractGeoJsonPoints(feature, source));
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

    const normalized = normalizePoint({ lat: Number(lat), lon: Number(lon), name, source });
    return normalized ? [normalized] : [];
  }

  return [];
}

function extractLatLonPairs(node: unknown, source: string, depth = 0): MapPoint[] {
  if (depth > 8 || node === null || node === undefined) {
    return [];
  }

  if (Array.isArray(node)) {
    const out: MapPoint[] = [];

    if (node.length >= 2 && isFiniteNumber(node[0]) && isFiniteNumber(node[1])) {
      const maybeLon = Number(node[0]);
      const maybeLat = Number(node[1]);
      const normalized = normalizePoint({ lat: maybeLat, lon: maybeLon, source });
      if (normalized) {
        out.push(normalized);
      }
    }

    for (const value of node) {
      out.push(...extractLatLonPairs(value, source, depth + 1));
    }

    return out;
  }

  if (typeof node !== "object") {
    return [];
  }

  const obj = node as Record<string, unknown>;

  const candidateLat = obj.lat ?? obj.latitude;
  const candidateLon = obj.lng ?? obj.lon ?? obj.longitude;
  const candidateName = obj.name ?? obj.title;

  const points: MapPoint[] = [];

  if (typeof candidateLat === "number" && typeof candidateLon === "number") {
    const normalized = normalizePoint({
      lat: candidateLat,
      lon: candidateLon,
      name: typeof candidateName === "string" ? candidateName : undefined,
      source
    });

    if (normalized) {
      points.push(normalized);
    }
  }

  for (const value of Object.values(obj)) {
    points.push(...extractLatLonPairs(value, source, depth + 1));
  }

  return points;
}

function dedupePoints(points: MapPoint[]): MapPoint[] {
  const unique = new Map<string, MapPoint>();

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
        // preserve any already known fields if the new point does not include them
        peakName: point.peakName ?? current.peakName,
        name: point.name ?? current.name,
        altitude: point.altitude ?? current.altitude,
        mountainLink: point.mountainLink ?? current.mountainLink,
        source: point.source ?? current.source
      });
    }
  }

  return Array.from(unique.values());
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
    // Fallback for forms that submit on Enter only.
  }
  await page.keyboard.press("Enter").catch(() => null);
}

async function readLoginError(page: Page): Promise<string | null> {
  const message = await page
    .evaluate(() => {
      const selectors = [
        '[role="alert"]',
        ".alert",
        ".alert-danger",
        ".error",
        ".invalid-feedback",
        ".text-danger"
      ];
      const nodes = selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)));
      for (const node of nodes) {
        const text = (node.textContent || "").trim().replace(/\s+/g, " ");
        if (text.length >= 4) {
          return text;
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

async function triggerMapActivity(page: Page): Promise<void> {
  const mapSelector = ".leaflet-container, .maplibregl-map, .ol-viewport, [id*='map']";
  const map = page.locator(mapSelector).first();

  if ((await map.count()) === 0) {
    return;
  }

  const box = await map.boundingBox();
  if (!box) {
    return;
  }

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

async function extractClientSidePoints(page: Page): Promise<MapPoint[]> {
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
      if (typeof value === "number") {
        return Number.isFinite(value) ? value : null;
      }
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
      if (latNum === null || lonNum === null) {
        return;
      }
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
        mountainLink: typeof extra?.mountainLink === "string" ? extra.mountainLink : undefined,
        source
      });
    };

    const parseAttrNumber = (value: string | null): number | undefined => {
      if (value === null) {
        return undefined;
      }
      const num = Number(value);
      return Number.isFinite(num) ? num : undefined;
    };

    const attrSelectors = [
      "[data-lat][data-lng]",
      "[data-latitude][data-longitude]",
      "[data-lat][data-lon]"
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
        const name = element.getAttribute("title") || element.getAttribute("aria-label") || undefined;
        add(lat, lon, name, "dom:data-attributes");
      }
    }

    const visited = new WeakSet<object>();
    const looksInteresting = (key: string) => /(map|leaflet|marker|pin|feature|point|store|state|param)/i.test(key);

    const walk = (node: unknown, source: string, depth = 0) => {
      if (depth > 7 || node === null || node === undefined) {
        return;
      }

      if (Array.isArray(node)) {
        if (node.length >= 2 && typeof node[0] === "number" && typeof node[1] === "number") {
          add(node[1], node[0], undefined, source);
        }
        for (const item of node) {
          walk(item, source, depth + 1);
        }
        return;
      }

      if (typeof node !== "object") {
        return;
      }

      const obj = node as Record<string, unknown>;
      if (visited.has(obj)) {
        return;
      }
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
          if (!item || typeof item !== "object") {
            continue;
          }
          const obj = item as Record<string, unknown>;
          add(obj.latitude, obj.longitude, obj.name, "window.PARAMS.areaMountains", {
            peakName: obj.name,
            altitude: obj.altitude,
            mountainLink: obj.mountainLink
          });
        }
      }

      const mapVisits = params.mapVisits;
      if (Array.isArray(mapVisits)) {
        for (const item of mapVisits) {
          if (!item || typeof item !== "object") {
            continue;
          }
          const obj = item as Record<string, unknown>;
          add(obj.latitude, obj.longitude, obj.name ?? obj.userName, "window.PARAMS.mapVisits");
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

  return dedupePoints(rawPoints.map((point) => ({ ...point })));
}

async function extractMapPoints(page: Page, targetUrl: string): Promise<{ points: MapPoint[]; sources: CandidateSource[] }> {
  const captured = new Map<string, { contentType: string; body: string }>();

  const onResponse = async (response: Response) => {
    try {
      const url = response.url();
      const contentType = (response.headers()["content-type"] || "").toLowerCase();
      const resourceType = response.request().resourceType();

      if (!["xhr", "fetch"].includes(resourceType)) {
        return;
      }

      const text = await response.text();
      if (!text || text.length > 2_000_000) {
        return;
      }

      const maybeJson = text.trim();
      if (!maybeJson.startsWith("{") && !maybeJson.startsWith("[")) {
        return;
      }

      captured.set(url, { contentType, body: text });
    } catch {
      // Response can disappear during navigation; ignore.
    }
  };

  page.on("response", onResponse);
  try {
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => null);

    await triggerMapActivity(page);
    await page.waitForTimeout(1200);

    const points: MapPoint[] = await extractClientSidePoints(page);
    const sources: CandidateSource[] = [];

    for (const [url, payload] of captured.entries()) {
      let data: unknown;

      try {
        data = JSON.parse(payload.body);
      } catch {
        continue;
      }

      const fromGeoJson = extractGeoJsonPoints(data, url);
      const fromLatLon = extractLatLonPairs(data, url);
      const all = dedupePoints([...fromGeoJson, ...fromLatLon]);

      if (all.length > 0) {
        points.push(...all);
        sources.push({ url, contentType: payload.contentType });
      }
    }

    const uniquePoints = dedupePoints(points);
    return { points: uniquePoints, sources };
  } finally {
    page.off("response", onResponse);
  }
}

async function extractRangeLinks(page: Page, sourceUrl: string): Promise<string[]> {
  const origin = new URL(sourceUrl).origin;
  const links = await page.evaluate((baseOrigin: string) => {
    const anchors = Array.from(document.querySelectorAll("main a[href], a[href]"));
    const out: string[] = [];

    for (const a of anchors) {
      const href = a.getAttribute("href");
      if (!href) {
        continue;
      }

      try {
        const absolute = new URL(href, baseOrigin);
        const path = absolute.pathname.toLowerCase();
        const text = (a.textContent || "").trim();

        if (!absolute.toString().startsWith(baseOrigin)) {
          continue;
        }
        if (path.includes("/country/") || path.includes("/login") || path.includes("/register")) {
          continue;
        }
        if (!path.startsWith("/area/")) {
          continue;
        }
        if (text.length < 2) {
          continue;
        }

        out.push(absolute.toString());
      } catch {
        // Ignore invalid URLs
      }
    }

    return out;
  }, origin);

  return Array.from(new Set(links));
}

function withPageSource(points: MapPoint[], pageUrl: string): MapPoint[] {
  return points.map((point) => ({
    ...point,
    source: point.source ? `${pageUrl}#${point.source}` : pageUrl
  }));
}

function createRunLogger(prefix: string) {
  const startedAt = Date.now();
  return {
    log: (message: string) => {
      const elapsed = Date.now() - startedAt;
      console.log(`${prefix} +${elapsed}ms ${message}`);
    }
  };
}

function normalizeLetter(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .slice(0, 1);
}

function firstLetterFromName(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  for (const ch of trimmed) {
    if (/[A-Za-zÁ-Žá-ž]/.test(ch)) {
      return ch.toUpperCase();
    }
  }

  return null;
}

function filterPointsByLetters(points: MapPoint[], letters: string[], mode: "strict" | "prefer"): MapPoint[] {
  if (mode === "prefer") {
    return points;
  }

  if (letters.length === 0) {
    return points;
  }

  const normalizedTarget = new Set(letters.map(normalizeLetter).filter(Boolean));
  if (normalizedTarget.size === 0) {
    return points;
  }

  return points.filter((point) => {
    const candidateName = point.peakName ?? point.name;
    if (!candidateName) {
      return false;
    }
    const first = firstLetterFromName(candidateName);
    if (!first) {
      return false;
    }
    return normalizedTarget.has(normalizeLetter(first));
  });
}

function filterPointsBySelectedAreas(points: MapPoint[], selectedAreaUrls: string[]): MapPoint[] {
  if (selectedAreaUrls.length === 0) {
    return points;
  }

  return points.filter((point) => {
    const source = point.source ?? "";
    if (!source) {
      return false;
    }
    return selectedAreaUrls.some((areaUrl) => source.startsWith(areaUrl));
  });
}

async function readPeaksCache(countryCode: string): Promise<PeaksCachePayload | null> {
  const primaryPath = getCachePathForCountry(countryCode);
  const pathsToTry = countryCode === "cz" ? [primaryPath, ALL_PEAKS_CACHE_PATH] : [primaryPath];
  for (const cachePath of pathsToTry) {
    try {
      const raw = await fs.readFile(cachePath, "utf8");
      const parsed = JSON.parse(raw) as PeaksCachePayload;
      if (Array.isArray(parsed.points)) {
        return parsed;
      }
    } catch {
      // try next path
    }
  }
  return null;
}

async function writePeaksCache(countryCode: string, payload: PeaksCachePayload): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(getCachePathForCountry(countryCode), JSON.stringify(payload, null, 2), "utf8");
}

export async function POST(request: Request) {
  const runId = Math.random().toString(36).slice(2, 8);
  const logger = createRunLogger(`[map-points:${runId}]`);
  const requestStartedAt = Date.now();

  const body = (await request.json()) as RequestPayload;
  const credentials = resolveHoryCredentials(body.username, body.password);
  const username = credentials.username;
  const password = credentials.password;
  const defaultTargetUrl =
    process.env.HORY_TARGET_URL?.trim() ||
    process.env.HORY_COUNTRY_URL?.trim() ||
    process.env.NEXT_PUBLIC_HORY_TARGET_URL?.trim() ||
    "https://cs.hory.app/country/czech-republic";
  const targetUrl = body.targetUrl?.trim() || defaultTargetUrl;
  const countryCode = body.countryCode?.trim() || countryCodeFromTargetUrl(targetUrl);
  const crawlRanges = body.crawlRanges !== false;
  const maxRanges = Math.max(1, Math.min(300, body.maxRanges ?? 120));
  const startsWithLetters = Array.isArray(body.startsWithLetters)
    ? body.startsWithLetters.map((item) => String(item).trim()).filter(Boolean)
    : [];
  const letterMode: "strict" | "prefer" = body.letterMode === "prefer" ? "prefer" : "strict";
  const selectedAreaUrlsRaw = Array.isArray(body.selectedAreaUrls)
    ? body.selectedAreaUrls.map((item) => String(item).trim()).filter(Boolean)
    : [];
  const useCache = body.useCache !== false;
  const refreshAllCache = body.refreshAllCache === true;
  const cacheOnly = body.cacheOnly === true;

  logger.log(
    `Request started: target=${targetUrl}, crawlRanges=${crawlRanges}, maxRanges=${maxRanges}, letters=${
      startsWithLetters.join(",") || "-"
    }, letterMode=${letterMode}`
  );

  let parsedTarget: URL;
  try {
    parsedTarget = new URL(targetUrl);
  } catch {
    logger.log("Invalid target URL.");
    return NextResponse.json({ error: "Neplatná cílová URL." }, { status: 400 });
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
    .filter((url) => url.startsWith(parsedTarget.origin) && new URL(url).pathname.toLowerCase().startsWith("/area/"));

  if (useCache && !refreshAllCache) {
    const cached = await readPeaksCache(countryCode);
    if (cached && cached.points.length > 0) {
      logger.log(`Cache hit: points=${cached.points.length}, cachedAt=${cached.cachedAt}`);
      let points = filterPointsBySelectedAreas(cached.points, selectedAreaUrls);
      const beforeLetterFilter = points.length;
      points = filterPointsByLetters(points, startsWithLetters, letterMode);
      const durationMs = Date.now() - requestStartedAt;
      return NextResponse.json({
        sourceUrl: cached.sourceUrl || parsedTarget.toString(),
        pageTitle: `${cached.pageTitle || "Vrcholy"} (cache)`,
        scrapedAt: cached.cachedAt,
        points,
        count: points.length,
        capturedResponseCount: 0,
        sourceCount: 0,
        sources: [],
        scannedRangePages: 0,
        durationMs,
        selectedAreaCount: selectedAreaUrls.length,
        startsWithLetters,
        letterMode,
        cached: true,
        cacheUpdatedAt: cached.cachedAt,
        cacheTotalPoints: cached.points.length,
        beforeLetterFilter
      });
    }
    if (cacheOnly) {
      logger.log("Cache-only mode: cache miss.");
      return NextResponse.json({ error: "Cache vrcholů zatím není dostupná." }, { status: 404 });
    }
  }

  if (!username || !password) {
    logger.log("Missing credentials and no usable cache.");
    return NextResponse.json({ error: "Chybí login nebo heslo (a cache vrcholů není dostupná)." }, { status: 400 });
  }

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
      logger.log(`Login failed (still on /login). ${loginError ? `Message="${loginError}"` : "No visible message."}`);
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

    let points: MapPoint[] = [];
    const sources: CandidateSource[] = [];
    let scannedRangePages = 0;

    if (selectedAreaUrls.length === 0) {
      logger.log("Collecting points from target page.");
      const primary = await extractMapPoints(page, parsedTarget.toString());
      points = withPageSource(primary.points, parsedTarget.toString());
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
          const rangeResult = await extractMapPoints(page, rangeUrl);
          const pointsBefore = points.length;
          points.push(...withPageSource(rangeResult.points, rangeUrl));
          sources.push(...rangeResult.sources);
          points = dedupePoints(points);
          logger.log(
            `Selected area done: added=${points.length - pointsBefore}, total=${points.length}, sourceHits=${sources.length}`
          );
        } catch {
          logger.log(`Selected area failed, skipping: ${rangeUrl}`);
        }
      }
    } else if (crawlRanges && isCountryPage) {
      const rangeLinks = await extractRangeLinks(page, parsedTarget.toString());
      logger.log(`Country page detected: found ${rangeLinks.length} area links, scanning up to ${maxRanges}.`);

      for (const [index, rangeUrl] of rangeLinks.slice(0, maxRanges).entries()) {
        try {
          scannedRangePages += 1;
          logger.log(`Range ${index + 1}/${Math.min(rangeLinks.length, maxRanges)}: ${rangeUrl}`);
          const rangeResult = await extractMapPoints(page, rangeUrl);
          const pointsBefore = points.length;
          points.push(...withPageSource(rangeResult.points, rangeUrl));
          sources.push(...rangeResult.sources);
          points = dedupePoints(points);
          logger.log(
            `Range done: added=${points.length - pointsBefore}, total=${points.length}, sourceHits=${sources.length}`
          );
        } catch {
          logger.log(`Range failed, skipping: ${rangeUrl}`);
          // Skip individual range page failures and continue.
        }
      }
    }

    points = dedupePoints(points);
    const beforeNamedFilter = points.length;
    const namedPoints = filterNamedPeaks(points);
    const preFilterCount = namedPoints.length;
    points = namedPoints;
    points = filterPointsByLetters(points, startsWithLetters, letterMode);
    const pageTitle = await page.title();
    const durationMs = Date.now() - requestStartedAt;

    if (refreshAllCache) {
      await writePeaksCache(countryCode, {
        cachedAt: new Date().toISOString(),
        sourceUrl: parsedTarget.toString(),
        pageTitle,
        points: namedPoints,
        scannedRangePages
      });
      logger.log(`All-peaks cache refreshed: points=${namedPoints.length}, scannedRangePages=${scannedRangePages}`);
    }

    logger.log(
      `Finished successfully: totalPoints=${points.length} (beforeNameFilter=${beforeNamedFilter}, beforeLetterFilter=${preFilterCount}), scannedRangePages=${scannedRangePages}, durationMs=${durationMs}`
    );

    return NextResponse.json({
      sourceUrl: parsedTarget.toString(),
      pageTitle,
      scrapedAt: new Date().toISOString(),
      points,
      count: points.length,
      capturedResponseCount: sources.length,
      sourceCount: sources.length,
      sources,
      scannedRangePages,
      durationMs,
      selectedAreaCount: selectedAreaUrls.length,
      startsWithLetters,
      letterMode,
      cached: false,
      cacheRefreshed: refreshAllCache
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Neočekávaná chyba při scrapování mapových bodů.";
    logger.log(`Failed: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    logger.log("Closing browser.");
    await browser.close();
  }
}
