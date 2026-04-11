import { chromium, Page } from "playwright";
import { NextResponse } from "next/server";
import { resolveHoryCredentials } from "../../../lib/hory-auth";
import { gotoWithRetry } from "../../../lib/playwright";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequestPayload = {
  username?: string;
  password?: string;
  targetUrl?: string;
};

type Range = {
  name: string;
  url: string;
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

async function extractRanges(page: Page, sourceUrl: string): Promise<Range[]> {
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
            path: absolute.pathname.toLowerCase()
          };
        } catch {
          return null;
        }
      })
      .filter((item): item is { name: string; url: string; path: string } => item !== null)
      .filter((item) => {
        if (item.name.length < 2) {
          return false;
        }
        if (!item.url.startsWith(baseOrigin)) {
          return false;
        }
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

export async function POST(request: Request) {
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

  if (!username || !password) {
    return NextResponse.json({ error: "Chybí login nebo heslo." }, { status: 400 });
  }

  let parsedTarget: URL;
  try {
    parsedTarget = new URL(targetUrl);
  } catch {
    return NextResponse.json({ error: "Neplatná cílová URL." }, { status: 400 });
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

    await page.goto(parsedTarget.toString(), { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => null);

    const ranges = await extractRanges(page, parsedTarget.toString());
    const pageTitle = await page.title();

    return NextResponse.json({
      sourceUrl: parsedTarget.toString(),
      pageTitle,
      scrapedAt: new Date().toISOString(),
      ranges,
      count: ranges.length
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Neočekávaná chyba při scrapování.";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await browser.close();
  }
}
