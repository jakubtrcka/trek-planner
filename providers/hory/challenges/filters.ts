import { type Page } from "playwright";

export async function setCheckboxByPhrase(page: Page, phrase: string, checked: boolean): Promise<boolean> {
  const changed = await page
    .evaluate(
      ({ phraseNeedle, checkedTarget }) => {
        const normalize = (v: string) =>
          v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
        const needle = normalize(phraseNeedle);
        for (const candidate of Array.from(document.querySelectorAll("label, .checkbox, .switch, .form-check"))) {
          if (!normalize(candidate.textContent || "").includes(needle)) continue;
          const input = candidate.querySelector("input[type='checkbox'], input[type='radio']");
          if (!(input instanceof HTMLInputElement)) continue;
          if (input.checked !== checkedTarget) {
            input.click();
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));
          }
          return true;
        }
        return false;
      },
      { phraseNeedle: phrase, checkedTarget: checked }
    )
    .catch(() => false);

  if (changed) return true;

  const locator = page.getByLabel(new RegExp(phrase, "i")).first();
  if ((await locator.count().catch(() => 0)) > 0) {
    if (checked) await locator.check().catch(() => null);
    else await locator.uncheck().catch(() => null);
    return true;
  }
  return false;
}

export async function applyChallengeFilters(
  page: Page,
  logger: { log: (message: string) => void }
): Promise<void> {
  logger.log("Applying challenge filters.");

  let endedHandled = await setCheckboxByPhrase(page, "skončen", false);
  let futureHandled = await setCheckboxByPhrase(page, "budouc", false);

  if (!endedHandled && !futureHandled) {
    const filterTriggers = [
      page.getByRole("button", { name: /^filtr/i }).first(),
      page.getByRole("link", { name: /^filtr/i }).first(),
      page.locator("button.filter-toggle, button[data-filter], [data-action*='filter']").first(),
    ];
    for (const trigger of filterTriggers) {
      if ((await trigger.count().catch(() => 0)) === 0) continue;
      await trigger.click().catch(() => null);
      await page.waitForTimeout(500);
      logger.log("Filter trigger clicked, retrying checkboxes.");
      endedHandled = await setCheckboxByPhrase(page, "skončen", false);
      futureHandled = await setCheckboxByPhrase(page, "budouc", false);
      break;
    }
  }

  logger.log(
    `Filter controls: ended=${endedHandled ? "ok" : "miss"}, future=${futureHandled ? "ok" : "miss"}`
  );

  if (endedHandled || futureHandled) {
    const submitButton = page
      .getByRole("button", { name: /pou[zž]ít|potvrdit|zobrazit|filtrovat|ulo[zž]it/i })
      .first();
    if ((await submitButton.count().catch(() => 0)) > 0) {
      await submitButton.click().catch(() => null);
      logger.log("Filter submit clicked.");
    }
  }

  await page.waitForLoadState("networkidle", { timeout: 12_000 }).catch(() => null);
  await page.waitForTimeout(1200);
}
