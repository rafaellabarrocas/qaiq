import { describe, it, expect } from "vitest";
import { analyze } from "../analyze.js";
import type { Rule, RulePack, SourceFile } from "../types.js";

const rule: Rule = {
  id: "WAIT-001", dimension: "wait-discipline", severity: "error", confidence: "high",
  title: "Hardcoded wait", rationale: "Sleeps are slow and flaky.",
  detect: { kind: "pattern", scope: "spec", pattern: /waitForTimeout\s*\(/g, opportunity: /await\s+/g },
  examples: { bad: "await page.waitForTimeout(1000);", good: "await expect(el).toBeVisible();" },
  fixtures: { triggers: "await page.waitForTimeout(1000);", clean: "await expect(el).toBeVisible();" },
};
const pack: RulePack = { name: "test", framework: "playwright", rules: [rule] };
const file = (content: string): SourceFile => ({ path: "a.spec.ts", content });

describe("analyze", () => {
  it("reports a violation with its line number", () => {
    const r = analyze([file("await page.waitForTimeout(500);")], pack);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toMatchObject({ ruleId: "WAIT-001", line: 1, path: "a.spec.ts" });
  });

  it("counts opportunities for later normalisation", () => {
    const r = analyze([file("await a();\nawait b();\nawait c();")], pack);
    expect(r.opportunities["wait-discipline"]).toBe(3);
  });

  // FIX 1a (final review wave): "vendor" alone (1 word) is exactly the class
  // of reason the new substantive-reason bar rejects. Updated to a reason
  // that clears >=15 chars AND >=3 words — the fix under test, not a
  // weakening of it.
  it("honours a reasoned suppression", () => {
    const r = analyze([file("// qaiq-disable-next-line WAIT-001 -- vendor widget has no ready signal\nawait page.waitForTimeout(1);")], pack);
    expect(r.findings.filter((f) => f.ruleId === "WAIT-001")).toHaveLength(0);
  });

  it("still emits SUP-001 for an unreasoned suppression", () => {
    const r = analyze([file("// qaiq-disable-next-line WAIT-001\nawait page.waitForTimeout(1);")], pack);
    expect(r.findings.map((f) => f.ruleId)).toContain("SUP-001");
  });

  it("matches a wholeFile rule across line breaks", () => {
    const multi: Rule = {
      ...rule, id: "MULTI-001",
      detect: { kind: "pattern", scope: "spec", pattern: /for\s*\([^)]*\)\s*\{[\s\S]*?expect/, opportunity: /await\s+/g, wholeFile: true },
    };
    const r = analyze([file("for (let i = 0; i < 3; i++) {\n  await expect(el).toBeVisible();\n}")],
      { name: "t", framework: "playwright", rules: [multi] });
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.line).toBe(1);
  });

  it("applies spec-scoped rules only to spec files", () => {
    const r = analyze([{ path: "helper.ts", content: "await page.waitForTimeout(1);" }], pack);
    expect(r.findings).toHaveLength(0);
  });

  it("routes a config-scoped rule to a workflows path with Windows-style backslash separators (FIX 8)", () => {
    const configRule: Rule = {
      ...rule, id: "CI-TEST-001", dimension: "ci-hygiene",
      detect: { kind: "pattern", scope: "config", pattern: /unpinned-image/, opportunity: /await\s+/g },
    };
    const r = analyze(
      [{ path: ".github\\workflows\\ci.yml", content: "unpinned-image" }],
      { name: "t", framework: "playwright", rules: [configRule] },
    );
    expect(r.findings.filter((f) => f.ruleId === "CI-TEST-001")).toHaveLength(1);
  });

  it("records a throwing detector as skipped and keeps analysing", () => {
    const exploding: Rule = {
      ...rule, id: "BOOM-001",
      detect: {
        kind: "ast", scope: "spec",
        visit: () => { throw new Error("parse error: unexpected token"); },
        countOpportunities: () => 1,
      },
    };
    const r = analyze(
      [file("await page.waitForTimeout(500);")],
      { name: "test", framework: "playwright", rules: [exploding, rule] },
    );
    expect(r.skipped).toHaveLength(1);
    expect(r.skipped[0]!.path).toBe("a.spec.ts");
    expect(r.skipped[0]!.reason).toContain("BOOM-001");
    expect(r.skipped[0]!.reason).toContain("parse error");
    expect(r.findings.filter((f) => f.ruleId === "WAIT-001")).toHaveLength(1);
  });

  // Round: fixes suppression laundering (FIX 1). The former assertion here
  // — that an unreasoned suppression ALSO silences the target rule — was
  // the bug itself: it let a reviewer take a fixture from 50/100 with 8
  // findings to 92/100 with 1 finding by adding a reasonless disable
  // comment. A suppression without a substantive reason must not apply.
  it("an unreasoned suppression does NOT silence the rule — it still reports, and SUP-001 also fires", () => {
    const r = analyze([file("// qaiq-disable-next-line WAIT-001\nawait page.waitForTimeout(1);")], pack);
    expect(r.findings.map((f) => f.ruleId)).toContain("SUP-001");
    expect(r.findings.filter((f) => f.ruleId === "WAIT-001")).toHaveLength(1);
  });

  it("a reason that is present but not substantive (too short) does not apply — SUP-001 fires and the rule still reports", () => {
    const r = analyze([file("// qaiq-disable-next-line WAIT-001 -- x\nawait page.waitForTimeout(1);")], pack);
    expect(r.findings.map((f) => f.ruleId)).toContain("SUP-001");
    expect(r.findings.filter((f) => f.ruleId === "WAIT-001")).toHaveLength(1);
  });

  it("a reason of '-- .' does not apply — SUP-001 fires and the rule still reports", () => {
    const r = analyze([file("// qaiq-disable-next-line WAIT-001 -- .\nawait page.waitForTimeout(1);")], pack);
    expect(r.findings.map((f) => f.ruleId)).toContain("SUP-001");
    expect(r.findings.filter((f) => f.ruleId === "WAIT-001")).toHaveLength(1);
  });

  it("a real substantive reason applies: the suppression is recorded and SUP-001 does not fire", () => {
    const r = analyze(
      [file("// qaiq-disable-next-line WAIT-001 -- third-party widget has no ready signal\nawait page.waitForTimeout(1);")],
      pack,
    );
    expect(r.findings.map((f) => f.ruleId)).not.toContain("SUP-001");
    expect(r.findings.filter((f) => f.ruleId === "WAIT-001")).toHaveLength(0);
    expect(r.suppressed).toHaveLength(1);
    expect(r.suppressed[0]).toMatchObject({
      ruleId: "WAIT-001", path: "a.spec.ts", line: 2,
      reason: "third-party widget has no ready signal",
    });
  });

  it("dedupes skipped by path: several failing rules on one file yield exactly one skipped entry", () => {
    const boom1: Rule = {
      ...rule, id: "BOOM-001",
      detect: { kind: "ast", scope: "spec", visit: () => { throw new Error("first failure"); }, countOpportunities: () => 1 },
    };
    const boom2: Rule = {
      ...rule, id: "BOOM-002",
      detect: { kind: "ast", scope: "spec", visit: () => { throw new Error("second failure"); }, countOpportunities: () => 1 },
    };
    const r = analyze(
      [file("await page.waitForTimeout(500);")],
      { name: "test", framework: "playwright", rules: [boom1, boom2, rule] },
    );
    expect(r.skipped).toHaveLength(1);
    expect(r.skipped[0]!.path).toBe("a.spec.ts");
    // First reason kept verbatim; a note records the additional failure.
    expect(r.skipped[0]!.reason).toContain("BOOM-001");
    expect(r.skipped[0]!.reason).toContain("first failure");
    expect(r.skipped[0]!.reason).toMatch(/1 more/);
  });
});
