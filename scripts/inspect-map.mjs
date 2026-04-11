import fs from "node:fs/promises";
import { chromium } from "playwright";

const LOGIN_URL = "https://cs.hory.app/login";
const TARGET_URL = process.env.TARGET_URL || "https://cs.hory.app/country/czech-republic";
const OUTPUT_PATH = process.env.OUTPUT_PATH || "map-debug-report.json";

const username = process.env.HORY_USERNAME;
const password = process.env.HORY_PASSWORD;

if (!username || !password) {
  console.error("Missing env vars: HORY_USERNAME and HORY_PASSWORD");
  process.exit(1);
}

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

async function fillFirstAvailable(page, selectors, value) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) > 0) {
      await locator.fill(value);
      return;
    }
  }
  throw new Error(`Field not found for selectors: ${selectors.join(", ")}`);
}

async function clickFirstAvailable(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) > 0) {
      await locator.click();
      return;
    }
  }
  throw new Error("Submit button not found");
}

async function triggerMapActivity(page) {
  const map = page.locator(".leaflet-container, .maplibregl-map, .ol-viewport, [id*='map']").first();
  if ((await map.count()) === 0) {
    return false;
  }

  const box = await map.boundingBox();
  if (!box) {
    return false;
  }

  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  await page.mouse.move(x, y);
  await page.mouse.wheel(0, -500);
  await page.waitForTimeout(400);
  await page.mouse.down();
  await page.mouse.move(x + 160, y + 50, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  await page.mouse.wheel(0, 350);

  return true;
}

function uniq(array) {
  return [...new Set(array)];
}

function extractInterestingStrings(source) {
  const absoluteUrls = source.match(/https?:\/\/[^\"'`\s)]+/g) || [];
  const apiPaths = source.match(/\/api\/[a-zA-Z0-9_\-\/]+/g) || [];
  const geoWords = source.match(/(geojson|featurecollection|feature|marker|leaflet|maplibre|bbox|tilejson|vector\s*tile)/gi) || [];

  return {
    absoluteUrls: uniq(absoluteUrls).slice(0, 200),
    apiPaths: uniq(apiPaths).slice(0, 200),
    geoKeywords: uniq(geoWords.map((v) => v.toLowerCase())).slice(0, 50)
  };
}

const browser = await chromium.launch({ headless: true });

try {
  const context = await browser.newContext();
  const page = await context.newPage();

  const responses = [];
  const scriptInsights = [];

  page.on("response", async (response) => {
    if (responses.length > 1200) {
      return;
    }

    const req = response.request();
    const url = response.url();
    const contentType = response.headers()["content-type"] || "";

    const item = {
      url,
      status: response.status(),
      method: req.method(),
      resourceType: req.resourceType(),
      contentType
    };

    responses.push(item);

    if (req.resourceType() === "script" && /javascript|ecmascript/i.test(contentType)) {
      try {
        const text = await response.text();
        if (text && text.length < 1_500_000) {
          const extracted = extractInterestingStrings(text);
          if (extracted.absoluteUrls.length || extracted.apiPaths.length || extracted.geoKeywords.length) {
            scriptInsights.push({
              url,
              ...extracted
            });
          }
        }
      } catch {
        // ignore script read failures
      }
    }
  });

  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await fillFirstAvailable(page, USER_SELECTORS, username);
  await fillFirstAvailable(page, PASS_SELECTORS, password);
  await clickFirstAvailable(page, SUBMIT_SELECTORS);

  await Promise.race([
    page.waitForURL((url) => !url.toString().includes("/login"), { timeout: 15_000 }),
    page.waitForLoadState("networkidle", { timeout: 15_000 })
  ]);

  if (page.url().includes("/login")) {
    throw new Error("Login failed");
  }

  await page.goto(TARGET_URL, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => null);
  const mapFound = await triggerMapActivity(page);
  await page.waitForTimeout(1800);

  const filteredNetwork = responses.filter((r) => {
    const u = r.url.toLowerCase();
    const ct = (r.contentType || "").toLowerCase();
    return (
      r.resourceType === "xhr" ||
      r.resourceType === "fetch" ||
      /map|tile|vector|feature|marker|geo|bbox|mountain|peak|leaflet|maplibre/.test(u) ||
      /json|geo\+json|protobuf|pbf|javascript/.test(ct)
    );
  });

  const tileLike = filteredNetwork.filter((r) => /\/\d+\/\d+\/\d+(\.|\?|$)/.test(r.url));
  const jsonLike = filteredNetwork.filter((r) => /json|geo\+json/i.test(r.contentType));

  const report = {
    createdAt: new Date().toISOString(),
    targetUrl: TARGET_URL,
    finalUrl: page.url(),
    pageTitle: await page.title(),
    mapFound,
    counters: {
      totalResponses: responses.length,
      filteredNetwork: filteredNetwork.length,
      jsonLike: jsonLike.length,
      tileLike: tileLike.length,
      scriptInsights: scriptInsights.length
    },
    filteredNetwork,
    scriptInsights
  };

  await fs.writeFile(OUTPUT_PATH, JSON.stringify(report, null, 2), "utf8");

  console.log(`Saved report to ${OUTPUT_PATH}`);
  console.log(`Responses: ${responses.length}, filtered: ${filteredNetwork.length}, jsonLike: ${jsonLike.length}, tileLike: ${tileLike.length}`);
} finally {
  await browser.close();
}
