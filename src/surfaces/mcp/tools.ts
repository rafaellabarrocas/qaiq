import { z } from "zod";
import { analyze } from "../../core/analyze.js";
import { score } from "../../core/score.js";
import { playwrightPack } from "../../rules/playwright/index.js";
import { discover } from "../../io/discover.js";
import { loadConfig } from "../../io/config.js";
import { DISCLAIMER, NOT_MEASURED } from "../../core/types.js";
import type { Scorecard, Finding, SuppressionRecord } from "../../core/types.js";

const CRITIQUE_ONLY = "Returns critique only. Does not generate, fix, or approve test code.";

/** Note the absent fields: no pass, approved, ready, ok, safe, success.
 *  There is deliberately no value here an agent can read as a green light. */
export interface CritiqueResult {
  findings: Finding[];
  score?: Scorecard;
  suppressed: SuppressionRecord[];
  openQuestions: string[];
  notMeasured: string[];
  disclaimer: string;
}

/**
 * Both critique tools accept arbitrary snippet content and must attribute it
 * to a synthetic path so inScope() routes config/CI-scoped rules correctly.
 * A snippet that defines a Playwright config is genuinely TypeScript and is
 * routed to a `.ts` config path. A snippet that reads like a GitHub Actions
 * workflow is YAML and must NOT be routed to a `.ts` path: a `.ts` extension
 * re-arms the TypeScript string-literal filter in detectors/pattern.ts
 * (isScriptFile), which then misreads an ordinary quoted YAML scalar like
 * `image: "mcr.microsoft.com/playwright"` as a TS string literal and silently
 * drops the finding inside it. So workflow-shaped YAML is routed to a `.yml`
 * config-scoped path instead. Anything else is routed as a spec file. Getting
 * any of this wrong makes qaiq_review_snippet return an empty findings array
 * for config/CI code, which reads as "clean" to an agent.
 */
function syntheticPathFor(code: string): string {
  const looksLikeConfig = /defineConfig\s*\(/.test(code);
  if (looksLikeConfig) return "playwright.config.ts";
  const looksLikeWorkflowYaml = /(^|\n)\s*(on|jobs|runs-on|steps|uses)\s*:/.test(code);
  if (looksLikeWorkflowYaml) return ".github/workflows/snippet.yml";
  return "snippet.spec.ts";
}

export const scanTool = {
  name: "qaiq_scan",
  description: `Score the test-suite hygiene of a repository. ${CRITIQUE_ONLY}`,
  schema: z.object({ path: z.string() }),
  async handler({ path }: { path: string }): Promise<CritiqueResult> {
    const cfg = await loadConfig(path);
    const { files, unreadable } = await discover(path, cfg);
    if (files.length === 0) throw new Error(`No test files found under ${path}`);
    const result = analyze(files, playwrightPack);
    const card = score({ ...result, skipped: [...result.skipped, ...unreadable] });
    // `suppressed` lives once, on `card` (the full Scorecard). The top-level
    // field below is that same array by reference, not a second construction
    // — the nested `score` object carries it only because it is part of the
    // full Scorecard shape, so the two can never drift apart.
    const { suppressed } = card;
    return {
      findings: card.findings, score: card, suppressed,
      openQuestions: card.openQuestions, notMeasured: card.notMeasured, disclaimer: card.disclaimer,
    };
  },
};

export const reviewSnippetTool = {
  name: "qaiq_review_snippet",
  description:
    `Critique a snippet of test code against QAIQ's rules. Returns findings about the code you provide — it does not return rewritten code. ${CRITIQUE_ONLY}`,
  schema: z.object({ code: z.string(), framework: z.string().optional() }),
  async handler({ code }: { code: string }): Promise<CritiqueResult> {
    const path = syntheticPathFor(code);
    const card = score(analyze([{ path, content: code }], playwrightPack));
    return {
      findings: card.findings, suppressed: card.suppressed, openQuestions: card.openQuestions,
      notMeasured: card.notMeasured, disclaimer: card.disclaimer,
    };
  },
};

export const explainRuleTool = {
  name: "qaiq_explain_rule",
  description:
    `Explain why a QAIQ rule exists, with generic illustrative examples. The examples are static documentation, identical for every caller and never tailored to your code. ${CRITIQUE_ONLY}`,
  schema: z.object({ ruleId: z.string() }),
  async handler({ ruleId }: { ruleId: string }) {
    const rule = playwrightPack.rules.find((r) => r.id === ruleId);
    if (!rule) throw new Error(`Unknown rule: ${ruleId}`);
    return {
      ruleId: rule.id, title: rule.title, rationale: rule.rationale,
      dimension: rule.dimension, severity: rule.severity, confidence: rule.confidence,
      examples: rule.examples,
      openQuestions: [
        "Does this rule apply to your situation, or is there a documented reason it should not? If the latter, suppress it with a reason.",
      ],
      notMeasured: NOT_MEASURED, disclaimer: DISCLAIMER,
    };
  },
};

export const listRulesTool = {
  name: "qaiq_list_rules",
  description: `List the rules QAIQ checks, optionally filtered by dimension. ${CRITIQUE_ONLY}`,
  schema: z.object({ dimension: z.string().optional() }),
  async handler({ dimension }: { dimension?: string }) {
    const rules = playwrightPack.rules
      .filter((r) => !dimension || r.dimension === dimension)
      .map((r) => ({ id: r.id, title: r.title, dimension: r.dimension, severity: r.severity, confidence: r.confidence }));
    return {
      rules,
      openQuestions: ["QAIQ checks how tests are written. Who is checking what they cover?"],
      notMeasured: NOT_MEASURED, disclaimer: DISCLAIMER,
    };
  },
};
