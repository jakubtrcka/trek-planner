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
  areaItems?: Array<{ name?: string; url?: string }>;
  maxAreas?: number;
  forceRefresh?: boolean;
};

type AreaFeature = {
  name: string;
  url: string;
  feature: {
    type: "Feature";
    properties: {
      name: string;
      url: string;
    };
    geometry: {
      type: string;
      coordinates: unknown;
    };
  };
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

const CACHE_DIR = path.join(process.cwd(), "data", "area-cache");

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

function toFeature(name: string, url: string, raw: unknown): AreaFeature["feature"] | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const obj = raw as Record<string, unknown>;
  const type = obj.type;
  const coordinates = obj.coordinates;

  if (type !== "Polygon" && type !== "MultiPolygon") {
    return null;
  }
  if (coordinates === undefined) {
    return null;
  }

  return {
    type: "Feature",
    properties: {
      name,
      url
    },
    geometry: {
      type,
      coordinates
    }
  };
}

function normalizeAreaItems(areaItems: RequestPayload["areaItems"]): Array<{ name: string; url: string }> {
  if (!Array.isArray(areaItems)) {
    return [];
  }

  return areaItems
    .map((item) => ({
      name: item?.name?.trim() || "",
      url: item?.url?.trim() || ""
    }))
    .filter((item) => Boolean(item.name && item.url));
}

function createCacheKey(items: Array<{ name: string; url: string }>): string {
  const joined = items
    .map((item) => item.url.trim().toLowerCase())
    .sort()
    .join("|");

  let hash = 5381;
  for (let i = 0; i < joined.length; i += 1) {
    hash = (hash * 33) ^ joined.charCodeAt(i);
  }
  return `areas-${Math.abs(hash)}`;
}

async function readCache(cachePath: string): Promise<AreaFeature[] | null> {
  try {
    const raw = await fs.readFile(cachePath, "utf8");
    const parsed = JSON.parse(raw) as { features?: AreaFeature[] };
    if (Array.isArray(parsed.features)) {
      return parsed.features;
    }
    return null;
  } catch {
    return null;
  }
}

async function writeCache(cachePath: string, features: AreaFeature[]): Promise<void> {
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await fs.writeFile(
    cachePath,
    JSON.stringify(
      {
        cachedAt: new Date().toISOString(),
        count: features.length,
        features
      },
      null,
      2
    ),
    "utf8"
  );
}

export async function POST(request: Request) {
  const body = (await request.json()) as RequestPayload;
  const credentials = resolveHoryCredentials(body.username, body.password);
  const username = credentials.username;
  const password = credentials.password;
  const maxAreas = Math.max(1, Math.min(300, body.maxAreas ?? 150));
  const forceRefresh = body.forceRefresh === true;
  const areaItems = normalizeAreaItems(body.areaItems).slice(0, maxAreas);
  const cacheKey = createCacheKey(areaItems);
  const cachePath = path.join(CACHE_DIR, `${cacheKey}.json`);
  console.log(
    `[area-geojson] start: requested=${areaItems.length}, maxAreas=${maxAreas}, forceRefresh=${forceRefresh}, cacheKey=${cacheKey}`
  );

  if (!username || !password) {
    return NextResponse.json({ error: "Chybí login nebo heslo." }, { status: 400 });
  }

  if (areaItems.length === 0) {
    return NextResponse.json({ error: "Chybí seznam oblastí." }, { status: 400 });
  }

  if (!forceRefresh) {
    const cached = await readCache(cachePath);
    if (cached && cached.length > 0) {
      console.log(`[area-geojson] cache hit: ${cached.length}`);
      return NextResponse.json({
        count: cached.length,
        features: cached,
        cached: true,
        cacheKey
      });
    }
  }

  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    await gotoWithRetry(page, LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 90_000 });

    await fillFirstAvailable(page, USER_SELECTORS, username);
    await fillFirstAvailable(page, PASS_SELECTORS, password);
    await submitLogin(page);

    await Promise.race([
      page.waitForURL((url) => !url.toString().includes("/login"), { timeout: 12_000 }),
      page.waitForLoadState("networkidle", { timeout: 12_000 })
    ]);

    if (page.url().includes("/login")) {
      const loginError = await readLoginError(page);
      return NextResponse.json(
        {
          error: loginError
            ? `Přihlášení selhalo: ${loginError}`
            : "Přihlášení pravděpodobně selhalo. Zkontroluj login/heslo."
        },
        { status: 401 }
      );
    }

    const features: AreaFeature[] = [];

    for (let i = 0; i < areaItems.length; i += 1) {
      const area = areaItems[i];
      try {
        await page.goto(area.url, { waitUntil: "domcontentloaded", timeout: 20_000 });
        await page.waitForTimeout(250);

        const geojson = await page.evaluate(() => {
          const params = (window as unknown as Record<string, unknown>).PARAMS as Record<string, unknown> | undefined;
          const areaMap = params?.areaMap as Record<string, unknown> | undefined;
          const raw = areaMap?.geojson;
          if (typeof raw === "string") {
            try {
              return JSON.parse(raw);
            } catch {
              return null;
            }
          }
          if (raw && typeof raw === "object") {
            return raw;
          }
          return null;
        });

        const feature = toFeature(area.name, area.url, geojson);
        if (feature) {
          features.push({
            name: area.name,
            url: area.url,
            feature
          });
        }
        if ((i + 1) % 20 === 0 || i === areaItems.length - 1) {
          console.log(`[area-geojson] progress: ${i + 1}/${areaItems.length}, loaded=${features.length}`);
        }
      } catch {
        // Skip failed area pages.
      }
    }
    console.log(`[area-geojson] done: loaded=${features.length}`);
    if (features.length > 0) {
      await writeCache(cachePath, features);
      console.log(`[area-geojson] cache write: ${cachePath}`);
    }

    return NextResponse.json({
      count: features.length,
      features,
      cached: false,
      cacheKey
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Neočekávaná chyba při načítání geojson oblastí.";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await browser.close();
  }
}
