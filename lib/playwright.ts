import type { Page } from "playwright";

type GotoOptions = Parameters<Page["goto"]>[1];

export async function gotoWithRetry(
  page: Page,
  url: string,
  options: GotoOptions,
  retries = 2,
  backoffMs = 1500
) {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await page.goto(url, options);
    } catch (error) {
      lastError = error;
      if (attempt >= retries) {
        throw error;
      }
      const delay = backoffMs * (attempt + 1);
      await page.waitForTimeout(delay);
    }
  }

  if (lastError) {
    throw lastError;
  }
}
