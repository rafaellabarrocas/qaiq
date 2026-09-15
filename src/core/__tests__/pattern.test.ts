import { describe, it, expect } from "vitest";
import { analyze } from "../analyze.js";
import { countPatternOpportunities } from "../detectors/pattern.js";
import { playwrightPack } from "../../rules/playwright/index.js";
import type { Rule, RulePack, SourceFile } from "../types.js";

const AWAIT = /await\s+/g;

const waitTimeoutRule: Rule = {
  id: "WAIT-001", dimension: "wait-discipline", severity: "error", confidence: "high",
  title: "Hardcoded wait", rationale: "Sleeps are slow and flaky, not real waits.",
  detect: { kind: "pattern", scope: "spec", pattern: /waitForTimeout\s*\(/, opportunity: AWAIT },
  examples: { bad: "await page.waitForTimeout(1000);", good: "await expect(el).toBeVisible();" },
  fixtures: { triggers: "await page.waitForTimeout(1000);", clean: "await expect(el).toBeVisible();" },
};
const pack: RulePack = { name: "test", framework: "playwright", rules: [waitTimeoutRule] };
const file = (content: string): SourceFile => ({ path: "a.spec.ts", content });

const rule = (id: string) => playwrightPack.rules.find((r) => r.id === id)!;

describe("string-literal-aware pattern matching", () => {
  it("does not fire on waitForTimeout( inside a string literal", () => {
    const r = analyze([file('const s = "await page.waitForTimeout(2000);";')], pack);
    expect(r.findings.filter((f) => f.ruleId === "WAIT-001")).toHaveLength(0);
  });

  it("still fires on a real waitForTimeout( call", () => {
    const r = analyze([file("await page.waitForTimeout(2000);")], pack);
    expect(r.findings.filter((f) => f.ruleId === "WAIT-001")).toHaveLength(1);
  });

  it("WAIT-003 still fires when the match starts in code and extends into its string argument", () => {
    const wait003 = rule("WAIT-003");
    const r = analyze(
      [{ path: "a.spec.ts", content: "await page.waitForLoadState('networkidle');" }],
      { name: "t", framework: "playwright", rules: [wait003] },
    );
    expect(r.findings.filter((f) => f.ruleId === "WAIT-003")).toHaveLength(1);
  });

  it("LOC-001 still fires on a real CSS-selector locator call", () => {
    const loc001 = rule("LOC-001");
    const r = analyze(
      [{ path: "a.spec.ts", content: "await page.locator('.btn-primary').click();" }],
      { name: "t", framework: "playwright", rules: [loc001] },
    );
    expect(r.findings.filter((f) => f.ruleId === "LOC-001")).toHaveLength(1);
  });

  it("opportunity counting ignores 'await ' occurrences inside string literals", () => {
    const withStringAwait = file('const s = "await page.waitForTimeout(2000);";\nawait real();');
    const n = countPatternOpportunities(waitTimeoutRule.detect as never, withStringAwait);
    // Only the real "await real();" counts — the one inside the string is excluded.
    expect(n).toBe(1);
  });

  it("does not fire on a template literal with interpolation", () => {
    const r = analyze(
      [file("const s = `await page.waitForTimeout(${n});`;")],
      pack,
    );
    expect(r.findings.filter((f) => f.ruleId === "WAIT-001")).toHaveLength(0);
  });

  describe("LOC-002 anchored to .locator( so it starts in code, not a per-rule exemption", () => {
    const loc002 = rule("LOC-002");
    const runLoc002 = (content: string) =>
      analyze([{ path: "a.spec.ts", content }], { name: "t", framework: "playwright", rules: [loc002] })
        .findings.filter((f) => f.ruleId === "LOC-002");

    it("still fires on a real nth-child locator call", () => {
      expect(runLoc002("await page.locator('li:nth-child(3)').click();")).toHaveLength(1);
    });

    it("stays silent on the clean fixture", () => {
      expect(runLoc002(loc002.fixtures.clean)).toHaveLength(0);
    });

    it("does not fire when the entire call sits inside an outer string literal (a fixture-string false positive)", () => {
      const content = 'const triggers = "await page.locator(\'li:nth-child(3)\').click();";';
      expect(runLoc002(content)).toHaveLength(0);
    });
  });

  describe("the TS string-literal filter is skipped for non-TS/JS files (FIX 7)", () => {
    const ci004 = rule("CI-004");
    const runCi004 = (content: string) =>
      analyze([{ path: ".github/workflows/ci.yml", content }], { name: "t", framework: "playwright", rules: [ci004] })
        .findings.filter((f) => f.ruleId === "CI-004");

    it("fires on the quoted YAML form (previously misread as a TS string literal and dropped)", () => {
      expect(runCi004('image: "mcr.microsoft.com/playwright"\n')).toHaveLength(1);
    });

    it("fires on the unquoted YAML form", () => {
      expect(runCi004("image: mcr.microsoft.com/playwright\n")).toHaveLength(1);
    });

    it("stays silent on a pinned, quoted image", () => {
      expect(runCi004('image: "mcr.microsoft.com/playwright:v1.49.0-noble"\n')).toHaveLength(0);
    });

    it("still applies the literal filter for an actual .ts file", () => {
      const content = 'const s = "image: mcr.microsoft.com/playwright";';
      const r = analyze([{ path: "playwright.config.ts", content }], { name: "t", framework: "playwright", rules: [ci004] });
      expect(r.findings.filter((f) => f.ruleId === "CI-004")).toHaveLength(0);
    });
  });
});
