import { chromium } from "playwright";
import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveHoryCredentials } from "../../../lib/hory-auth";
import { gotoWithRetry } from "../../../lib/playwright";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOGIN_URL = "https://cs.hory.app/login";
const CACHE_DIR = path.join(process.cwd(), "data", "points-cache");
const CACHE_PATH = path.join(CACHE_DIR, "user-ascents.json");
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

type AscentEntry = {
  peakId: number;
  peakName: string;
  count: number;
  dates: string[]; // ISO date strings, newest first
};

type UserAscentsCache = {
  cachedAt: string;
  profileUrl: string;
  totalAscents: number;
  ascents: AscentEntry[];
};

type RequestPayload = {
  username?: string;
  password?: string;
  refreshCache?: boolean;
};

async function readCache(): Promise<UserAscentsCache | null> {
  try {
    const raw = await fs.readFile(CACHE_PATH, "utf-8");
    const data = JSON.parse(raw) as UserAscentsCache;
    const age = Date.now() - new Date(data.cachedAt).getTime();
    if (age > CACHE_TTL_MS) return null;
    return data;
  } catch {
    return null;
  }
}

async function writeCache(data: UserAscentsCache): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(CACHE_PATH, JSON.stringify(data, null, 2), "utf-8");
}

/** Parse Czech date like "6. 7. 2025" → "2025-07-06" */
function parseCzechDate(text: string): string | null {
  const m = text.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/** Extract peak ID from mountain URL like /mountain/22968-na-rovinach */
function peakIdFromUrl(href: string): number | null {
  const m = href.match(/\/mountain\/(\d+)-/);
  return m ? Number(m[1]) : null;
}

export async function POST(request: Request) {
  const body = (await request.json()) as RequestPayload;
  const credentials = resolveHoryCredentials(body.username, body.password);

  if (!credentials.hasCredentials) {
    return NextResponse.json({ error: "Chybí přihlašovací údaje." }, { status: 400 });
  }

  if (!body.refreshCache) {
    const cached = await readCache();
    if (cached) return NextResponse.json(cached);
  }

  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Login
    await gotoWithRetry(page, LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.locator('input[type="email"], input[name="email"]').first().fill(credentials.username);
    await page.locator('input[type="password"]').first().fill(credentials.password);
    await Promise.all([
      page.waitForURL((url) => !url.toString().includes("/login"), { timeout: 20_000 }),
      page.locator('input[type="submit"], button[type="submit"]').first().click(),
    ]);

    // Find main profile link (e.g. /p/57648-jakubtrcka) — no sub-paths
    const profileUrl = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll("a[href]"));
      const profile = links.find((a) => /^\/p\/\d+[^/]*$/.test(a.getAttribute("href") ?? ""));
      if (!profile) return null;
      return new URL(profile.getAttribute("href")!, location.origin).toString();
    });

    if (!profileUrl) {
      return NextResponse.json({ error: "Nepodařilo se najít odkaz na profil." }, { status: 500 });
    }

    await page.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });

    // Read total ascent count from stats block
    const totalAscents = await page.evaluate(() => {
      const blocks = Array.from(document.querySelectorAll(".stat-block.box"));
      for (const block of blocks) {
        const label = block.textContent ?? "";
        if (/po[cč]et výstup[uů]/i.test(label)) {
          const num = label.replace(/\D+/g, "");
          return num ? Number(num) : null;
        }
      }
      return null;
    });

    // Scroll to load all visits
    const maxScrolls = 60;
    for (let i = 0; i < maxScrolls; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(600);
      const loaded = await page.$$eval(".box.visit-box", (els) => els.length);
      if (totalAscents && loaded >= totalAscents) break;
    }

    // Extract all visit boxes
    const rawVisits = await page.evaluate(() => {
      const boxes = Array.from(document.querySelectorAll(".box.visit-box"));
      return boxes.map((box) => {
        const link = box.querySelector('strong a[href*="/mountain/"]');
        const href = link?.getAttribute("href") ?? "";
        const peakName = link?.textContent?.trim().replace(/\s*\(\d+\s*m\)\s*$/, "") ?? "";

        // Date: tag that contains a calendar icon
        const allTags = Array.from(box.querySelectorAll(".visit-tags .tag"));
        const dateTag = allTags.find((t) => t.querySelector('[class*="fa-calendar"]'));
        const dateText = dateTag?.textContent?.trim() ?? "";

        return { href, peakName, dateText };
      });
    });

    // Group by peak ID
    const byPeakId = new Map<number, { peakName: string; dates: string[] }>();

    for (const v of rawVisits) {
      const peakId = peakIdFromUrl(v.href);
      if (!peakId) continue;
      const isoDate = parseCzechDate(v.dateText) ?? "";
      const existing = byPeakId.get(peakId);
      if (existing) {
        if (isoDate && !existing.dates.includes(isoDate)) existing.dates.push(isoDate);
      } else {
        byPeakId.set(peakId, { peakName: v.peakName, dates: isoDate ? [isoDate] : [] });
      }
    }

    const ascents: AscentEntry[] = Array.from(byPeakId.entries()).map(([peakId, data]) => ({
      peakId,
      peakName: data.peakName,
      count: data.dates.length || 1,
      dates: data.dates.sort().reverse(),
    }));

    const result: UserAscentsCache = {
      cachedAt: new Date().toISOString(),
      profileUrl,
      totalAscents: totalAscents ?? rawVisits.length,
      ascents,
    };

    await writeCache(result);
    return NextResponse.json(result);
  } catch (err) {
    console.error("user-ascents scrape failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Chyba při načítání výstupů." },
      { status: 500 }
    );
  } finally {
    await browser.close();
  }
}

export async function GET() {
  const cached = await readCache();
  if (cached) return NextResponse.json(cached);
  return NextResponse.json({ error: "Žádná cache výstupů. Spusť POST pro načtení." }, { status: 404 });
}
