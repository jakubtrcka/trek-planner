import { type Page } from "playwright";

// ── Constants ──────────────────────────────────────────────────────────────────

export const LOGIN_URL = "https://cs.hory.app/login";
export const CHALLENGES_URL = "https://cs.hory.app/challenges";

const USER_SELECTORS = [
  'input[type="email"]',
  'input[name="email"]',
  'input[name="username"]',
  'input[name="login"]',
  'input[autocomplete="username"]',
  'input[type="text"]',
];

const PASS_SELECTORS = [
  'input[type="password"]',
  'input[name="password"]',
  'input[autocomplete="current-password"]',
];

const SUBMIT_SELECTORS = [
  'button[type="submit"]',
  'input[type="submit"]',
  'button:has-text("Přihlásit")',
  'button:has-text("Přihlášení")',
  'button:has-text("Login")',
];

// ── Helpers ────────────────────────────────────────────────────────────────────

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

async function submitLoginForm(page: Page): Promise<void> {
  try {
    await clickFirstAvailable(page, SUBMIT_SELECTORS);
  } catch {
    // Some forms submit only on Enter.
  }
  await page.keyboard.press("Enter").catch(() => null);
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function performLogin(page: Page, username: string, password: string): Promise<void> {
  await fillFirstAvailable(page, USER_SELECTORS, username);
  await fillFirstAvailable(page, PASS_SELECTORS, password);
  await submitLoginForm(page);
}

export async function readLoginError(page: Page): Promise<string | null> {
  const message = await page
    .evaluate(() => {
      const selectors = [
        '[role="alert"]', ".alert", ".alert-danger", ".error", ".invalid-feedback", ".text-danger",
      ];
      for (const selector of selectors) {
        for (const node of Array.from(document.querySelectorAll(selector))) {
          const text = (node.textContent || "").trim().replace(/\s+/g, " ");
          if (text.length >= 4) return text;
        }
      }
      return null;
    })
    .catch(() => null);

  if (!message) return null;
  return message.length > 160 ? `${message.slice(0, 157)}...` : message;
}
