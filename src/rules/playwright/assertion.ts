import ts from "typescript";
import type { Rule } from "../../core/types.js";
import { walk, calleeText, countTestCalls, visitWith } from "../../core/detectors/ast.js";

/** Playwright matchers that retry and therefore MUST be awaited. */
const ASYNC_MATCHERS = new Set([
  "toBeVisible", "toBeHidden", "toBeEnabled", "toBeDisabled", "toBeChecked",
  "toHaveText", "toContainText", "toHaveValue", "toHaveURL", "toHaveTitle",
  "toHaveCount", "toHaveAttribute", "toHaveClass", "toBeAttached", "toBeFocused",
]);

const ASSERTION_HELPER_TOKENS = new Set(["assert", "verify", "check", "should"]);

/** True when a call looks like an assertion: an expect(...) form, or a helper
 *  whose FIRST token is an assertion verb. Token-exact, not prefix —
 *  `checkState` counts, `checkoutFlow` does not. A leading `_` or `$` (private
 *  helper, jQuery-style helper) is stripped before extracting the token, and
 *  an ALL_CAPS run (`ASSERT_LOADED`) is recognised as a whole token rather
 *  than collapsing to its single leading letter. */
function isAssertionCallee(c: string): boolean {
  if (c.startsWith("expect")) return true;
  const last = (c.split(".").pop() ?? "").replace(/^[_$]+/, "");
  const firstToken = (/^[A-Z]+(?![a-z])|^[A-Za-z][a-z]*/.exec(last)?.[0] ?? "").toLowerCase();
  return ASSERTION_HELPER_TOKENS.has(firstToken);
}

export const assertionRules: Rule[] = [
  {
    id: "ASR-001", dimension: "assertion-strength", severity: "error", confidence: "heuristic",
    title: "Test with no assertion",
    rationale:
      "A test without an assertion only proves the code did not throw. It goes green whatever the feature actually rendered, so it reports coverage it does not have — worse than no test, because it looks like one. QAIQ cannot see inside helper functions, so a test that delegates its assertions may be flagged — confirm before acting.",
    detect: {
      kind: "ast", scope: "spec", countOpportunities: countTestCalls,
      visit: visitWith((sf, push) => walk(sf, (n) => {
        if (!ts.isCallExpression(n) || !/^(test|it)$/.test(calleeText(n))) return;
        let found = false;
        walk(n, (inner) => {
          if (!ts.isCallExpression(inner)) return;
          if (isAssertionCallee(calleeText(inner))) found = true;
        });
        if (!found) push(n);
      })),
    },
    examples: { bad: "test('loads', async ({ page }) => { await page.goto('/'); });", good: "test('loads', async ({ page }) => { await page.goto('/'); await expect(page.getByRole('heading')).toBeVisible(); });" },
    fixtures: {
      triggers: "test('loads', async ({ page }) => { await page.goto('/'); });",
      clean: "test('loads', async ({ page }) => { await expect(page.getByRole('heading')).toBeVisible(); });",
    },
  },
  {
    id: "ASR-002", dimension: "assertion-strength", severity: "error", confidence: "high",
    title: "Tautological assertion",
    rationale:
      "An assertion over a literal can never fail, so it is a comment with a green tick next to it. It usually marks a test someone abandoned halfway and never came back to.",
    detect: {
      kind: "ast", scope: "spec", countOpportunities: countTestCalls,
      visit: visitWith((sf, push) => walk(sf, (n) => {
        if (!ts.isCallExpression(n) || calleeText(n) !== "expect") return;
        const arg = n.arguments[0];
        if (!arg) return;
        if (arg.kind === ts.SyntaxKind.TrueKeyword || arg.kind === ts.SyntaxKind.FalseKeyword
          || ts.isNumericLiteral(arg) || ts.isStringLiteral(arg)) push(n);
      })),
    },
    examples: { bad: "expect(true).toBe(true);", good: "await expect(page.getByRole('alert')).toHaveText('Saved');" },
    fixtures: { triggers: "test('a', () => { expect(true).toBe(true); });", clean: "test('a', async () => { await expect(el).toHaveText('Saved'); });" },
  },
  {
    id: "ASR-004", dimension: "assertion-strength", severity: "error", confidence: "high",
    title: "Missing await on a retrying assertion",
    rationale:
      "Playwright's web-first matchers return a promise. Unawaited, the assertion is scheduled and abandoned — it can never fail the test, and the failure it would have reported surfaces later as an unhandled rejection or not at all.",
    detect: {
      kind: "ast", scope: "spec", countOpportunities: countTestCalls,
      visit: visitWith((sf, push) => walk(sf, (n) => {
        if (!ts.isCallExpression(n) || !ts.isPropertyAccessExpression(n.expression)) return;
        const matcher = n.expression.name.text;
        if (!ASYNC_MATCHERS.has(matcher)) return;
        if (!n.expression.expression.getText().includes("expect")) return;
        let p: ts.Node | undefined = n.parent;
        while (p && (ts.isParenthesizedExpression(p) || ts.isPropertyAccessExpression(p))) p = p.parent;
        const awaited = p && (ts.isAwaitExpression(p) || ts.isReturnStatement(p));
        if (!awaited) push(n);
      })),
    },
    examples: { bad: "expect(page.getByRole('alert')).toBeVisible();", good: "await expect(page.getByRole('alert')).toBeVisible();" },
    fixtures: {
      triggers: "test('a', async () => { expect(el).toBeVisible(); });",
      clean: "test('a', async () => { await expect(el).toBeVisible(); });",
    },
  },
];
