import type { Rule } from "../../core/types.js";

const LOCATORS = /(page|frame|component)\.(locator|getBy\w+|\$\$?)\s*\(/g;

export const locatorRules: Rule[] = [
  {
    id: "LOC-001", dimension: "locator-quality", severity: "error", confidence: "high",
    title: "CSS or XPath selector instead of a user-facing locator",
    rationale:
      "Selectors tied to classes, ids or DOM paths break on refactors that change nothing a user can see. Role, label and test-id locators describe what the user perceives, so they survive restyling.",
    detect: { kind: "pattern", scope: "spec", pattern: /\.locator\(\s*['"`][.#[/]/, opportunity: LOCATORS },
    examples: {
      bad: "page.locator('.btn-primary > span')",
      good: "page.getByRole('button', { name: 'Save' })",
    },
    fixtures: {
      triggers: "await page.locator('.btn-primary').click();",
      clean: "await page.getByRole('button', { name: 'Save' }).click();",
    },
  },
  {
    id: "LOC-002", dimension: "locator-quality", severity: "error", confidence: "high",
    title: "Positional selector",
    rationale:
      "nth-child and index-based selection encode the current ordering of the DOM. Any inserted element silently retargets the locator at a different control, so the test keeps passing while testing the wrong thing.",
    // The nth-child alternative is anchored to start at `.locator(` so the
    // match begins in real code and runs into the selector string, rather
    // than a bare `nth-child(` that would sit wholly inside the string
    // literal and be dropped by the string-literal filter in pattern.ts.
    detect: {
      kind: "pattern", scope: "spec",
      pattern: /\.locator\([^)]*nth-child\(|\.nth\(\s*\d+\s*\)|\[\s*\d+\s*\]\s*\.click/, opportunity: LOCATORS,
    },
    examples: { bad: "page.locator('li:nth-child(3)')", good: "page.getByRole('listitem', { name: 'Invoices' })" },
    fixtures: { triggers: "await page.locator('li:nth-child(3)').click();", clean: "await page.getByRole('listitem').click();" },
  },
  {
    id: "LOC-003", dimension: "locator-quality", severity: "warning", confidence: "heuristic",
    title: "Long literal text selector",
    rationale:
      "Matching a full sentence couples the test to product copy, which changes for reasons unrelated to behaviour. A short accessible name or a test id expresses the same intent without breaking on a wording tweak.",
    detect: { kind: "pattern", scope: "spec", pattern: /getByText\(\s*['"`][^'"`]{45,}/, opportunity: LOCATORS },
    examples: { bad: "page.getByText('Your invoice has been submitted successfully and is awaiting approval')", good: "page.getByTestId('invoice-submitted-banner')" },
    fixtures: {
      triggers: "await page.getByText('Your invoice has been submitted successfully and is awaiting approval').click();",
      clean: "await page.getByTestId('invoice-submitted-banner').click();",
    },
  },
  {
    id: "LOC-004", dimension: "locator-quality", severity: "error", confidence: "high",
    title: "page.$ / page.$$ element handles",
    rationale:
      "These return a handle captured at call time with no auto-waiting and no retry. If the element re-renders the handle goes stale, producing failures that look like product bugs but are test artefacts.",
    detect: { kind: "pattern", scope: "spec", pattern: /(?<![\w$])page\.\$\$?\s*\(/, opportunity: LOCATORS },
    examples: { bad: "const el = await page.$('.row');", good: "const el = page.getByRole('row');" },
    fixtures: { triggers: "const el = await page.$('.row');", clean: "const el = page.getByRole('row');" },
  },
];
