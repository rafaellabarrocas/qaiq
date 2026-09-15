import type { Rule } from "../../core/types.js";

const ONE = /^/;  // exactly one opportunity per config file

export const ciRules: Rule[] = [
  {
    id: "CI-001", dimension: "ci-hygiene", severity: "error", confidence: "heuristic",
    title: "No trace or screenshot retained on failure",
    rationale:
      "Without a trace, a CI-only failure gives you a stack line and nothing else. Traces are the difference between diagnosing a flake in minutes and re-running the suite hoping to reproduce it.",
    detect: { kind: "pattern", scope: "config", pattern: /^(?![\s\S]*trace\s*:)[\s\S]*defineConfig/, opportunity: ONE, wholeFile: true },
    examples: {
      bad: "export default defineConfig({ testDir: './tests' });",
      good: "export default defineConfig({ use: { trace: 'on-first-retry', screenshot: 'only-on-failure' } });",
    },
    fixtures: {
      triggers: "export default defineConfig({ testDir: './tests' });",
      clean: "export default defineConfig({ use: { trace: 'on-first-retry' } });",
    },
  },
  {
    id: "CI-002", dimension: "ci-hygiene", severity: "warning", confidence: "high",
    title: "Retry count high enough to mask flake",
    rationale:
      "Retries above two convert a reproducible failure into an occasional one. The suite goes green while the underlying race stays in the product, which is the opposite of what a test suite is for.",
    detect: { kind: "pattern", scope: "config", pattern: /retries\s*:\s*([3-9]|\d{2,})/, opportunity: ONE },
    examples: { bad: "retries: 5", good: "retries: process.env.CI ? 2 : 0" },
    fixtures: { triggers: "export default defineConfig({ retries: 5, use: { trace: 'on' } });", clean: "export default defineConfig({ retries: 2, use: { trace: 'on' } });" },
  },
  {
    id: "CI-003", dimension: "ci-hygiene", severity: "info", confidence: "heuristic",
    title: "No parallelism configured",
    rationale:
      "A suite pinned to one worker gets slower with every test added, and slow feedback is the main reason teams stop running tests before merging.",
    detect: { kind: "pattern", scope: "config", pattern: /workers\s*:\s*1\b/, opportunity: ONE },
    examples: { bad: "workers: 1", good: "workers: process.env.CI ? 4 : undefined" },
    fixtures: { triggers: "export default defineConfig({ workers: 1, use: { trace: 'on' } });", clean: "export default defineConfig({ workers: 4, use: { trace: 'on' } });" },
  },
  {
    id: "CI-004", dimension: "ci-hygiene", severity: "warning", confidence: "heuristic",
    title: "Unpinned browser image in CI",
    rationale:
      "An unpinned Playwright image means the browser version changes underneath you, so a suite that passed yesterday can fail today for reasons no commit explains.",
    detect: { kind: "pattern", scope: "config", pattern: /mcr\.microsoft\.com\/playwright(?!:v)/, opportunity: ONE },
    examples: { bad: "image: mcr.microsoft.com/playwright", good: "image: mcr.microsoft.com/playwright:v1.49.0-noble" },
    fixtures: { triggers: "image: mcr.microsoft.com/playwright\n", clean: "image: mcr.microsoft.com/playwright:v1.49.0-noble\n" },
  },
];
