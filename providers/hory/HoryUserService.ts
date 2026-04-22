import { chromium, type Page } from "playwright";
import { z } from "zod";
import { gotoWithRetry } from "../../lib/playwright";
import type { HoryCredentials } from "./HoryScraperService";

export const AscentEntrySchema = z.object({ peakId: z.number(), peakName: z.string(), count: z.number(), dates: z.array(z.string()) });
export const UserAscentsResultSchema = z.object({ cachedAt: z.string(), profileUrl: z.string(), totalAscents: z.number(), ascents: z.array(AscentEntrySchema) });
export type AscentEntry = z.infer<typeof AscentEntrySchema>;
export type UserAscentsResult = z.infer<typeof UserAscentsResultSchema>;

const LOGIN_URL = "https://cs.hory.app/login";

const USER_SELECTORS = ['input[type="email"]', 'input[name="email"]', 'input[name="username"]', 'input[autocomplete="username"]', 'input[type="text"]'];
const PASS_SELECTORS = ['input[type="password"]', 'input[name="password"]', 'input[autocomplete="current-password"]'];
const SUBMIT_SELECTORS = ['button[type="submit"]', 'input[type="submit"]', 'button:has-text("Přihlásit")', 'button:has-text("Login")'];

async function fillFirstAvailable(page: Page, selectors: string[], value: string): Promise<void> {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) > 0) { await locator.fill(value); return; }
  }
  throw new Error(`Nenašel jsem vhodné pole (${selectors.join(", ")}).`);
}

async function submitLogin(page: Page): Promise<void> {
  for (const selector of SUBMIT_SELECTORS) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) > 0) { await locator.click(); break; }
  }
  await page.keyboard.press("Enter").catch(() => null);
}

async function login(page: Page, username: string, password: string): Promise<void> {
  await gotoWithRetry(page, LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await fillFirstAvailable(page, USER_SELECTORS, username);
  await fillFirstAvailable(page, PASS_SELECTORS, password);
  await page.screenshot({ path: "/tmp/hory-before-submit.png" }).catch(() => null);
  await submitLogin(page);

  await Promise.race([
    page.waitForURL((url) => !url.toString().includes("/login"), { timeout: 30_000 }),
    page.waitForLoadState("networkidle", { timeout: 30_000 }),
  ]);

  if (page.url().includes("/login")) {
    await page.screenshot({ path: "/tmp/hory-login-fail.png", fullPage: true }).catch(() => null);
    const errText = await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll('[role="alert"], .alert, .error, .invalid-feedback, .text-danger'));
      for (const n of nodes) { const t = (n.textContent ?? "").trim(); if (t.length >= 4) return t; }
      return null;
    }).catch(() => null);
    throw new Error(`Login failed${errText ? `: ${errText}` : " — credentials rejected or bot protection triggered"} (screenshot: /tmp/hory-login-fail.png)`);
  }
}

export class HoryUserService {
  constructor(private readonly credentials: HoryCredentials) {}

  async scrapeUserAscents(): Promise<UserAscentsResult> {
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext();
      const page = await context.newPage();

      await login(page, this.credentials.username, this.credentials.password);

      const profileUrl = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll("a[href]"));
        const profile = links.find((a) => /^\/p\/\d+[^/]*$/.test(a.getAttribute("href") ?? ""));
        if (!profile) return null;
        return new URL(profile.getAttribute("href")!, location.origin).toString();
      });

      if (!profileUrl) throw new Error("Nepodařilo se najít odkaz na profil.");

      await page.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });

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

      for (let i = 0; i < 60; i++) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(600);
        const loaded = await page.$$eval(".box.visit-box", (els) => els.length);
        if (totalAscents && loaded >= totalAscents) break;
      }

      const rawVisits = await page.evaluate(() =>
        Array.from(document.querySelectorAll(".box.visit-box")).map((box) => {
          const link = box.querySelector('strong a[href*="/mountain/"]');
          const href = link?.getAttribute("href") ?? "";
          const peakName = link?.textContent?.trim().replace(/\s*\(\d+\s*m\)\s*$/, "") ?? "";
          const allTags = Array.from(box.querySelectorAll(".visit-tags .tag"));
          const dateTag = allTags.find((t) => t.querySelector('[class*="fa-calendar"]'));
          return { href, peakName, dateText: dateTag?.textContent?.trim() ?? "" };
        })
      );

      const byPeakId = new Map<number, { peakName: string; dates: string[] }>();
      for (const v of rawVisits) {
        const peakId = this.peakIdFromUrl(v.href);
        if (!peakId) continue;
        const isoDate = this.parseCzechDate(v.dateText) ?? "";
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

      return {
        cachedAt: new Date().toISOString(),
        profileUrl,
        totalAscents: totalAscents ?? rawVisits.length,
        ascents,
      };
    } finally {
      await browser.close();
    }
  }

  private parseCzechDate(text: string): string | null {
    const m = text.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
    if (!m) return null;
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  private peakIdFromUrl(href: string): number | null {
    const m = href.match(/\/mountain\/(\d+)-/);
    return m ? Number(m[1]) : null;
  }
}
