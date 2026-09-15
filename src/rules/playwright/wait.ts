import type { Rule } from "../../core/types.js";

const AWAIT = /await\s+/g;

export const waitRules: Rule[] = [
  {
    id: "WAIT-001", dimension: "wait-discipline", severity: "error", confidence: "high",
    title: "Hardcoded wait",
    rationale:
      "A fixed sleep is either too short (flaky on a slow run) or too long (slow on every run). It encodes a guess about timing rather than the condition you are actually waiting for.",
    detect: { kind: "pattern", scope: "spec", pattern: /waitForTimeout\s*\(/, opportunity: AWAIT },
    examples: {
      bad: "await page.waitForTimeout(2000);\nawait expect(toast).toBeVisible();",
      good: "await expect(toast).toBeVisible();",
    },
    fixtures: {
      triggers: "await page.waitForTimeout(2000);",
      clean: "await expect(page.getByRole('alert')).toBeVisible();",
    },
  },
  {
    id: "WAIT-002", dimension: "wait-discipline", severity: "warning", confidence: "high",
    title: "Manual visibility polling",
    rationale:
      "Asserting on isVisible() takes a single snapshot with no retry, so it races the UI. Web-first assertions retry until the timeout and report what they actually saw.",
    detect: { kind: "pattern", scope: "spec", pattern: /\.(isVisible|isEnabled)\(\)\s*\)?\s*\)?\s*\.toBe\(/, opportunity: AWAIT },
    examples: {
      bad: "expect(await el.isVisible()).toBe(true);",
      good: "await expect(el).toBeVisible();",
    },
    fixtures: {
      triggers: "expect(await el.isVisible()).toBe(true);",
      clean: "await expect(el).toBeVisible();",
    },
  },
  {
    id: "WAIT-003", dimension: "wait-discipline", severity: "warning", confidence: "high",
    title: "waitForLoadState('networkidle')",
    rationale:
      "networkidle waits for the network to go quiet, which never happens reliably on apps with polling, websockets or analytics. Playwright discourages it precisely because it is unpredictable.",
    detect: { kind: "pattern", scope: "spec", pattern: /waitForLoadState\s*\(\s*['"`]networkidle['"`]/, opportunity: AWAIT },
    examples: {
      bad: "await page.waitForLoadState('networkidle');",
      good: "await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();",
    },
    fixtures: {
      triggers: "await page.waitForLoadState('networkidle');",
      clean: "await expect(page.getByRole('heading')).toBeVisible();",
    },
  },
  {
    id: "WAIT-004", dimension: "wait-discipline", severity: "info", confidence: "high",
    title: "Redundant waitForLoadState('domcontentloaded')",
    rationale:
      "page.goto() already waits for this state by default, so the extra call adds a line of noise without changing behaviour, and implies a timing concern that is not real.",
    detect: { kind: "pattern", scope: "spec", pattern: /waitForLoadState\s*\(\s*['"`]domcontentloaded['"`]/, opportunity: AWAIT },
    examples: { bad: "await page.goto('/');\nawait page.waitForLoadState('domcontentloaded');", good: "await page.goto('/');" },
    fixtures: { triggers: "await page.waitForLoadState('domcontentloaded');", clean: "await page.goto('/');" },
  },
  {
    id: "WAIT-005", dimension: "wait-discipline", severity: "warning", confidence: "heuristic",
    title: "Hand-rolled retry loop",
    rationale:
      "A manual retry loop around an assertion reimplements what web-first assertions already do, but without their error reporting — when it finally fails you learn only that it timed out, not what the value was.",
    detect: { kind: "pattern", scope: "spec", pattern: /for\s*\([^)]*\)\s*\{[^}]*?await[^}]*?expect/, opportunity: AWAIT, wholeFile: true },
    examples: {
      bad: "for (let i = 0; i < 5; i++) { if (await el.isVisible()) break; await page.waitForTimeout(200); }",
      good: "await expect(el).toBeVisible({ timeout: 10_000 });",
    },
    fixtures: {
      triggers: "for (let i = 0; i < 5; i++) { await expect(el).toBeVisible(); }",
      clean: "await expect(el).toBeVisible({ timeout: 10_000 });",
    },
  },
];
