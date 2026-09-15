import { describe, it, expect } from "vitest";
import { scanTool, reviewSnippetTool, explainRuleTool, listRulesTool } from "../tools.js";
import { forbiddenKeys } from "./forbiddenKeys.js";

const TOOLS = [
  { t: scanTool, args: { path: process.cwd() } },
  { t: reviewSnippetTool, args: { code: "test('a', async () => { await page.waitForTimeout(1); });" } },
  { t: explainRuleTool, args: { ruleId: "WAIT-001" } },
  { t: listRulesTool, args: {} },
];

describe("MCP result schema", () => {
  for (const { t, args } of TOOLS) {
    it(`${t.name} exposes no green-light field an agent could read as approval`, async () => {
      expect(forbiddenKeys(await t.handler(args as never))).toEqual([]);
    });
  }

  for (const { t, args } of TOOLS) {
    it(`${t.name} carries the disclaimer`, async () => {
      const r = await t.handler(args as never) as { disclaimer?: string };
      expect(r.disclaimer).toContain("A high score means your tests are well-written");
    });
  }

  it("scan returns a non-empty openQuestions even when nothing is wrong", async () => {
    const r = await reviewSnippetTool.handler({
      code: "test('a', async () => { await expect(el).toBeVisible(); });",
    }) as { openQuestions: string[] };
    expect(r.openQuestions.length).toBeGreaterThan(0);
  });

  it("no tool name implies generation", () => {
    for (const { t } of TOOLS) {
      expect(t.name).not.toMatch(/write|generate|create|fix|autofix|apply/i);
    }
  });

  it("every tool description states the critique-only constraint", () => {
    for (const { t } of TOOLS) expect(t.description).toMatch(/critique only/i);
  });

  it("qaiq_scan and qaiq_review_snippet payloads carry a NON-EMPTY suppressed array, and it is clean of forbidden keys", async () => {
    // A genuine, substantive suppression — the only thing exercising this
    // guard for real. An always-empty `suppressed` array would let a planted
    // green-light key (e.g. `ok: true`) inside a suppression record slip
    // through unnoticed, since `forbiddenKeys([])` is vacuously `[]`.
    const codeWithSuppression = [
      "test('a', async () => {",
      "  // qaiq-disable-next-line WAIT-001 -- third-party widget exposes no ready signal",
      "  await page.waitForTimeout(1000);",
      "});",
    ].join("\n");

    const snippetResult = await reviewSnippetTool.handler({
      code: codeWithSuppression,
    }) as { suppressed: unknown[] };
    expect(Array.isArray(snippetResult.suppressed)).toBe(true);
    expect(snippetResult.suppressed.length).toBeGreaterThan(0);
    expect(forbiddenKeys(snippetResult)).toEqual([]);

    const scanResult = await scanTool.handler({ path: process.cwd() }) as { suppressed: unknown[] };
    expect(Array.isArray(scanResult.suppressed)).toBe(true);
    expect(forbiddenKeys(scanResult)).toEqual([]);
  });
});

describe("qaiq_review_snippet routes config-shaped snippets to a config-scoped path (FIX 1)", () => {
  it("an empty findings array on a defineConfig snippet would read as 'clean' to an agent — this must not happen", async () => {
    const r = await reviewSnippetTool.handler({
      code: "export default defineConfig({ retries: 9, workers: 1 });",
    }) as { findings: Array<{ ruleId: string }> };
    expect(r.findings.length).toBeGreaterThan(0);
    expect(r.findings.some((f) => f.ruleId === "CI-002")).toBe(true);
    expect(r.findings.some((f) => f.ruleId === "CI-003")).toBe(true);
  });

  it("an ordinary spec snippet still routes as a spec file (regression)", async () => {
    const r = await reviewSnippetTool.handler({
      code: "test('a', async () => { await page.waitForTimeout(1); });",
    }) as { findings: Array<{ ruleId: string }> };
    expect(r.findings.some((f) => f.ruleId === "WAIT-001")).toBe(true);
  });

  it("a workflow-YAML-shaped snippet (unquoted image) routes to the config-scoped path and fires CI-004", async () => {
    const r = await reviewSnippetTool.handler({
      code: "on:\n  push:\njobs:\n  test:\n    steps:\n      - uses: actions/checkout@v4\n      - run: echo image: mcr.microsoft.com/playwright",
    }) as { findings: Array<{ ruleId: string }> };
    expect(r.findings.some((f) => f.ruleId === "CI-004")).toBe(true);
  });

  it("a quoted image in workflow YAML must still fire CI-004 — routing to a .ts synthetic path silently ate this", async () => {
    const r = await reviewSnippetTool.handler({
      code: 'jobs:\n  test:\n    container:\n      image: "mcr.microsoft.com/playwright"\n',
    }) as { findings: Array<{ ruleId: string }> };
    expect(r.findings.some((f) => f.ruleId === "CI-004")).toBe(true);
  });

  it("a pinned, quoted image in workflow YAML stays silent on CI-004 (regression against over-firing)", async () => {
    const r = await reviewSnippetTool.handler({
      code: 'jobs:\n  test:\n    container:\n      image: "mcr.microsoft.com/playwright:v1.49.0-noble"\n',
    }) as { findings: Array<{ ruleId: string }> };
    expect(r.findings.some((f) => f.ruleId === "CI-004")).toBe(false);
  });
});
