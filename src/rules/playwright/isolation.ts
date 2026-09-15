import ts from "typescript";
import type { Rule } from "../../core/types.js";
import { walk, calleeText, countTestCalls, visitWith } from "../../core/detectors/ast.js";

export const isolationRules: Rule[] = [
  {
    id: "ISO-001", dimension: "test-isolation", severity: "error", confidence: "high",
    title: "Mutable module-level state shared across tests",
    rationale:
      "A top-level let is shared by every test in the file, so tests silently depend on each other's leftovers. It passes locally in declaration order and fails the moment the suite shards or runs in parallel.",
    detect: {
      kind: "ast", scope: "spec", countOpportunities: countTestCalls,
      visit: visitWith((sf, push) => {
        for (const st of sf.statements) {
          if (ts.isVariableStatement(st) && !(st.declarationList.flags & ts.NodeFlags.Const)) push(st);
        }
      }),
    },
    examples: { bad: "let userId;\ntest('a', async () => { userId = await create(); });", good: "test('a', async () => { const userId = await create(); });" },
    fixtures: { triggers: "let userId;\ntest('a', async () => {});", clean: "const userId = 'fixed';\ntest('a', async () => {});" },
  },
  {
    id: "ISO-002", dimension: "test-isolation", severity: "warning", confidence: "high",
    title: "Serial execution mode",
    rationale:
      "describe.serial makes every test depend on the one before it, so a single early failure skips the rest and hides their result. It trades real coverage for a green-looking run.",
    detect: {
      kind: "ast", scope: "spec", countOpportunities: countTestCalls,
      visit: visitWith((sf, push) => walk(sf, (n) => {
        if (ts.isCallExpression(n) && calleeText(n).includes("describe.serial")) push(n);
      })),
    },
    examples: { bad: "test.describe.serial('checkout', () => {});", good: "test.describe('checkout', () => {});" },
    fixtures: { triggers: "test.describe.serial('x', () => {});", clean: "test.describe('x', () => {});" },
  },
  {
    id: "ISO-003", dimension: "test-isolation", severity: "warning", confidence: "heuristic",
    title: "Setup hook with no matching teardown",
    rationale:
      "A beforeEach that creates data with no afterEach to remove it leaves records behind on every run. The suite slowly poisons its own environment until someone cleans the database by hand.",
    detect: {
      kind: "ast", scope: "spec", countOpportunities: countTestCalls,
      visit: visitWith((sf, push) => {
        let setup: ts.Node | null = null; let teardown = false;
        walk(sf, (n) => {
          if (!ts.isCallExpression(n)) return;
          const c = calleeText(n);
          if (/before(Each|All)$/.test(c) && !setup) setup = n;
          if (/after(Each|All)$/.test(c)) teardown = true;
        });
        if (setup && !teardown) push(setup);
      }),
    },
    examples: { bad: "test.beforeEach(async () => { await createOrder(); });", good: "test.beforeEach(async () => { id = await createOrder(); });\ntest.afterEach(async () => { await deleteOrder(id); });" },
    fixtures: {
      triggers: "test.beforeEach(async () => { await createOrder(); });\ntest('a', async () => {});",
      clean: "test.beforeEach(async () => {});\ntest.afterEach(async () => {});\ntest('a', async () => {});",
    },
  },
  {
    id: "ISO-004", dimension: "test-isolation", severity: "warning", confidence: "heuristic",
    title: "Hardcoded identity data that collides in parallel",
    rationale:
      "A fixed email or username means two workers running the same spec fight over the same record. The failure surfaces as an unrelated flake on whichever worker lost the race.",
    detect: {
      kind: "ast", scope: "spec", countOpportunities: countTestCalls,
      visit: visitWith((sf, push) => {
        const randomised = /Date\.now\(\)|randomUUID|faker\.|nanoid\(/.test(sf.getFullText());
        if (randomised) return;
        walk(sf, (n) => {
          if (ts.isStringLiteral(n) && /^[\w.+-]+@[\w-]+\.[a-z]{2,}$/i.test(n.text)) push(n);
        });
      }),
    },
    examples: { bad: "await page.getByLabel('Email').fill('test@example.com');", good: "await page.getByLabel('Email').fill(`test+${Date.now()}@example.com`);" },
    fixtures: {
      triggers: "test('a', async () => { await f('test@example.com'); });",
      clean: "test('a', async () => { await f(`test+${Date.now()}@example.com`); });",
    },
  },
];
