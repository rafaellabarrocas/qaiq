import { describe, it, expect } from "vitest";
import { analyze } from "../analyze.js";
import { score } from "../score.js";
import { playwrightPack } from "../../rules/playwright/index.js";
import type { SourceFile } from "../types.js";

const file = (path: string, content: string): SourceFile => ({ path, content });

// A suite whose CI hygiene is measurably bad: no trace, retries high enough
// to mask flake, pinned to one worker.
const CONFIG = file(
  "playwright.config.ts",
  `export default defineConfig({ testDir: './tests', retries: 5, workers: 1 });\n`,
);

const SPEC = file(
  "tests/checkout.spec.ts",
  `import { test, expect } from '@playwright/test';
test('adds an item', async ({ page }) => {
  await page.goto('/shop');
  await page.locator('.product-card > button.add').click();
  await page.waitForTimeout(2000);
  await expect(page.locator('#cart-count')).toHaveText('1');
});
`,
);

const headline = (files: SourceFile[]) => score(analyze(files, playwrightPack)).hygieneScore;

describe("omission must never pay", () => {
  it("does not raise the headline when the config it judges is deleted", () => {
    const withConfig = headline([SPEC, CONFIG]);
    const withoutConfig = headline([SPEC]);

    // The invariant score.ts already documents at the n/a branch: a suite with
    // no CI config "must not raise its headline by omission". Averaging only
    // the measured dimensions breaks it — dropping a below-average dimension
    // lifts the average.
    expect(withoutConfig).not.toBeNull();
    expect(withConfig).not.toBeNull();
    expect(withoutConfig!).toBeLessThanOrEqual(withConfig!);
  });

  it("keeps ci-hygiene measured when the config is missing, rather than n/a", () => {
    const s = score(analyze([SPEC], playwrightPack));
    const ci = s.dimensions.find((d) => d.dimension === "ci-hygiene")!;

    // Absent is not the same as inapplicable. A Playwright suite with no
    // config has not escaped CI-hygiene scoring; it has failed it.
    expect(ci.score).not.toBeNull();
  });
});
