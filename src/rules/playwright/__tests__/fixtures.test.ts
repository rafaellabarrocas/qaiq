import { describe, it, expect } from "vitest";
import { playwrightPack } from "../index.js";
import { analyze } from "../../../core/analyze.js";
import { validatePack } from "../../../core/registry.js";
import type { Rule } from "../../../core/types.js";

// The brief's harness ran every rule against a hardcoded "a.spec.ts" path.
// That is wrong for the four CI rules, which are scope: "config" — inScope()
// never routes a config-scoped rule to a .spec.ts path, so their "fires on
// its triggering fixture" tests would fail for reasons unrelated to the rule
// itself. Select the path from the rule's scope instead.
const pathFor = (rule: Rule) =>
  rule.detect.scope === "config" ? "playwright.config.ts" : "a.spec.ts";

const run = (rule: Rule, content: string) =>
  analyze([{ path: pathFor(rule), content }], { name: "t", framework: "playwright", rules: [rule] })
    .findings.filter((f) => f.ruleId === rule.id);

describe("playwright pack", () => {
  it("validates", () => expect(() => validatePack(playwrightPack)).not.toThrow());

  it("has no duplicate ids", () => {
    const ids = playwrightPack.rules.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const rule of playwrightPack.rules) {
    describe(rule.id, () => {
      it("fires on its triggering fixture", () => {
        expect(run(rule, rule.fixtures.triggers).length).toBeGreaterThan(0);
      });
      it("stays silent on its clean fixture", () => {
        expect(run(rule, rule.fixtures.clean)).toHaveLength(0);
      });
      it("explains itself", () => {
        expect(rule.rationale.length).toBeGreaterThan(40);
        expect(rule.examples.good).toBeTruthy();
      });
    });
  }
});

describe("false positives", () => {
  const rule = (id: string) => playwrightPack.rules.find((r) => r.id === id)!;

  describe("LOC-004 — page.$ must be a whole identifier, not a suffix", () => {
    const loc004 = rule("LOC-004");

    it("does not fire on a page-object variable named *page (homepage.$)", () => {
      expect(run(loc004, "await homepage.$('.row');")).toHaveLength(0);
    });

    it("still fires on a real page.$ handle", () => {
      expect(run(loc004, "const el = await page.$('.row');").length).toBeGreaterThan(0);
    });

    it("still does not fire on page.$eval, which was never a match", () => {
      expect(run(loc004, "page.$eval('x', (e) => e);")).toHaveLength(0);
    });
  });

  describe("comment-line blanking (systemic fix in pattern.ts)", () => {
    const wait004 = rule("WAIT-004");
    const ci002 = rule("CI-002");
    const wait001 = rule("WAIT-001");

    it("does not fire on a commented-out WAIT-004 violation", () => {
      expect(run(wait004, "// await page.waitForLoadState('domcontentloaded');")).toHaveLength(0);
    });

    it("still fires on a live WAIT-004 violation", () => {
      expect(run(wait004, "await page.waitForLoadState('domcontentloaded');").length).toBeGreaterThan(0);
    });

    it("does not fire CI-002 on a commented-out retries value above a clean live config", () => {
      const content =
        "// old value was retries: 5\nexport default defineConfig({ retries: 2, use: { trace: 'on' } });";
      expect(run(ci002, content)).toHaveLength(0);
    });

    it("keeps line numbers correct when a comment line precedes a real violation", () => {
      const content = "// await page.waitForTimeout(999);\nawait page.waitForTimeout(2000);";
      const findings = run(wait001, content);
      expect(findings).toHaveLength(1);
      expect(findings[0]!.line).toBe(2);
    });
  });

  describe("WAIT-005 bounded to the loop body", () => {
    const wait005 = rule("WAIT-005");

    it("does not fire when an unrelated await expect follows an assertion-free for loop", () => {
      const content =
        "for (const item of items) {\n  console.log(item);\n}\nawait expect(banner).toBeVisible();";
      expect(run(wait005, content)).toHaveLength(0);
    });

    it("still fires on its existing triggering fixture", () => {
      expect(run(wait005, wait005.fixtures.triggers).length).toBeGreaterThan(0);
    });
  });

  describe("stripCommentLines does not blank generator-method shorthand (Task 5 regression)", () => {
    const wait001 = rule("WAIT-001");

    it("still fires WAIT-001 on a generator-method shorthand line starting with '*'", () => {
      const content = "class Steps {\n  *slowStep() { await page.waitForTimeout(3000); }\n}";
      expect(run(wait001, content).length).toBeGreaterThan(0);
    });

    it("still ignores a genuine block-comment continuation line", () => {
      const content = "/**\n * some prose\n */\nawait expect(el).toBeVisible();";
      expect(run(wait001, content)).toHaveLength(0);
    });
  });

  describe("ASR-001 does not fire on helper-delegated assertions (Task 6 review round 1)", () => {
    const asr001 = rule("ASR-001");

    it("does not fire when the assertion is delegated to an assert* helper", () => {
      expect(run(asr001, "test('loads', async ({ page }) => { await assertLoaded(page); });")).toHaveLength(0);
    });

    it("does not fire when the assertion is delegated to a verify* helper", () => {
      expect(run(asr001, "test('loads', async ({ page }) => { await verifyHeader(page); });")).toHaveLength(0);
    });

    it("still fires on a genuinely assertion-free test", () => {
      expect(run(asr001, "test('loads', async ({ page }) => { await page.goto('/'); });")).toHaveLength(1);
    });

    it("has confidence downgraded to heuristic", () => {
      expect(asr001.confidence).toBe("heuristic");
    });
  });

  describe("ASR-001 helper match is token-exact, not prefix (Task 6 review round 2)", () => {
    const asr001 = rule("ASR-001");

    it("still fires when the only call is checkoutFlow (prefix 'check' is not the whole token)", () => {
      expect(run(asr001, "test('a', async () => { await checkoutFlow(page); });")).toHaveLength(1);
    });

    it("still fires when the only call is shouldersTap (prefix 'should' is not the whole token)", () => {
      expect(run(asr001, "test('a', async () => { await shouldersTap(); });")).toHaveLength(1);
    });

    it("does not fire when the only call is assertLoaded", () => {
      expect(run(asr001, "test('a', async () => { await assertLoaded(page); });")).toHaveLength(0);
    });

    it("does not fire when the only call is checkState", () => {
      expect(run(asr001, "test('a', async () => { await checkState(page); });")).toHaveLength(0);
    });

    it("does not fire when the only call is verifyHeader", () => {
      expect(run(asr001, "test('a', async () => { await verifyHeader(page); });")).toHaveLength(0);
    });

    it("does not fire on a dotted callee whose last segment is an assertion verb", () => {
      expect(run(asr001, "test('a', async () => { await helpers.assertLoaded(page); });")).toHaveLength(0);
    });

    it("does not fire on expect.soft(...)", () => {
      expect(run(asr001, "test('a', async () => { expect.soft(x).toBe(1); });")).toHaveLength(0);
    });

    it("still fires on a genuinely assertion-free test (page.goto only)", () => {
      expect(run(asr001, "test('a', async ({ page }) => { await page.goto('/'); });")).toHaveLength(1);
    });

    it("does not fire on PascalCase AssertLoaded (Task 6 review round 3 regression)", () => {
      expect(run(asr001, "test('a', async () => { await AssertLoaded(page); });")).toHaveLength(0);
    });

    it("does not fire on PascalCase VerifyHeader", () => {
      expect(run(asr001, "test('a', async () => { await VerifyHeader(page); });")).toHaveLength(0);
    });

    it("still fires on PascalCase CheckoutFlow (PascalCase is not a blanket exemption)", () => {
      expect(run(asr001, "test('a', async () => { await CheckoutFlow(page); });")).toHaveLength(1);
    });

    it("does not fire on check2FA (digit boundary still works)", () => {
      expect(run(asr001, "test('a', async () => { await check2FA(page); });")).toHaveLength(0);
    });

    it("does not fire on the bare verb assert", () => {
      expect(run(asr001, "test('a', async () => { await assert(page); });")).toHaveLength(0);
    });
  });

  describe("ASR-001 strips leading _ / $ and handles all-caps helper names (FIX 6, deferred item #12)", () => {
    const asr001 = rule("ASR-001");

    it("does not fire on an underscore-prefixed private helper (_assertLoaded)", () => {
      expect(run(asr001, "test('a', async () => { await _assertLoaded(page); });")).toHaveLength(0);
    });

    it("does not fire on a $-prefixed helper ($check)", () => {
      expect(run(asr001, "test('a', async () => { await $check(page); });")).toHaveLength(0);
    });

    it("does not fire on an ALL_CAPS_SNAKE helper (ASSERT_LOADED)", () => {
      expect(run(asr001, "test('a', async () => { await ASSERT_LOADED(page); });")).toHaveLength(0);
    });

    it("does not fire on AssertLoaded (PascalCase, regression)", () => {
      expect(run(asr001, "test('a', async () => { await AssertLoaded(page); });")).toHaveLength(0);
    });

    it("does not fire on assertLoaded (camelCase, regression)", () => {
      expect(run(asr001, "test('a', async () => { await assertLoaded(page); });")).toHaveLength(0);
    });

    it("does not fire on checkState (regression)", () => {
      expect(run(asr001, "test('a', async () => { await checkState(page); });")).toHaveLength(0);
    });

    it("still fires when the only call is checkoutFlow", () => {
      expect(run(asr001, "test('a', async () => { await checkoutFlow(page); });")).toHaveLength(1);
    });

    it("still fires when the only call is CheckoutFlow", () => {
      expect(run(asr001, "test('a', async () => { await CheckoutFlow(page); });")).toHaveLength(1);
    });

    it("still fires when the only call is shouldersTap", () => {
      expect(run(asr001, "test('a', async () => { await shouldersTap(); });")).toHaveLength(1);
    });

    it("still fires when the only call is page.goto", () => {
      expect(run(asr001, "test('a', async ({ page }) => { await page.goto('/'); });")).toHaveLength(1);
    });
  });

  describe("CI-001 suppression now works (FIX 5 — wholeFile findings were unsuppressible)", () => {
    const ci001 = rule("CI-001");

    it("still fires with no suppression present", () => {
      expect(run(ci001, ci001.fixtures.triggers).length).toBeGreaterThan(0);
    });

    it("a reasoned disable comment directly above the config statement suppresses CI-001", () => {
      const content =
        "// qaiq-disable-next-line CI-001 -- third-party managed runner already retains traces\n" +
        "export default defineConfig({ testDir: './tests' });";
      expect(run(ci001, content)).toHaveLength(0);
    });

    it("an unreasoned disable comment does NOT suppress CI-001 (still fires, plus SUP-001)", () => {
      const content =
        "// qaiq-disable-next-line CI-001\nexport default defineConfig({ testDir: './tests' });";
      const findings = analyze(
        [{ path: "playwright.config.ts", content }],
        { name: "t", framework: "playwright", rules: [ci001] },
      ).findings;
      expect(findings.some((f) => f.ruleId === "CI-001")).toBe(true);
      expect(findings.some((f) => f.ruleId === "SUP-001")).toBe(true);
    });

    it("a reasoned disable comment near the top, not immediately adjacent, still suppresses via the first-5-lines fallback", () => {
      const content =
        "// qaiq-disable-next-line CI-001 -- third-party managed runner already retains traces\n" +
        "// unrelated header comment\n" +
        "export default defineConfig({ testDir: './tests' });";
      expect(run(ci001, content)).toHaveLength(0);
    });
  });
});
