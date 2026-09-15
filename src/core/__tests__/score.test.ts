import { describe, it, expect } from "vitest";
import { score } from "../score.js";
import type { AnalyzeResult } from "../analyze.js";
import { DIMENSIONS, DISCLAIMER } from "../types.js";
import type { Dimension, Finding } from "../types.js";

const zero = () => Object.fromEntries(DIMENSIONS.map((d) => [d, 0])) as Record<Dimension, number>;

const finding = (over: Partial<Finding> = {}): Finding => ({
  ruleId: "WAIT-001", dimension: "wait-discipline", severity: "error", confidence: "high",
  title: "t", rationale: "r", path: "a.spec.ts", line: 1, match: "m", ...over,
});

const result = (over: Partial<AnalyzeResult> = {}): AnalyzeResult => ({
  findings: [], skipped: [], suppressed: [], opportunities: zero(), filesScanned: 1, ...over,
});

const dim = (s: ReturnType<typeof score>, d: Dimension) =>
  s.dimensions.find((x) => x.dimension === d)!;

describe("score", () => {
  it("scores a clean dimension with opportunities at 100", () => {
    const s = score(result({ opportunities: { ...zero(), "wait-discipline": 10 } }));
    expect(dim(s, "wait-discipline").score).toBe(100);
  });

  it("reports a dimension with zero opportunities as n/a, NOT 100", () => {
    const s = score(result());
    expect(dim(s, "ci-hygiene").score).toBeNull();
  });

  it("applies the density formula", () => {
    // one error = 3 * 1.0 = 3; 10 opportunities -> density .3 -> 70
    const s = score(result({ findings: [finding()], opportunities: { ...zero(), "wait-discipline": 10 } }));
    expect(dim(s, "wait-discipline").score).toBe(70);
  });

  it("halves the weight of heuristic findings", () => {
    // 3 * 0.5 = 1.5; /10 -> .15 -> 85
    const s = score(result({
      findings: [finding({ confidence: "heuristic" })],
      opportunities: { ...zero(), "wait-discipline": 10 },
    }));
    expect(dim(s, "wait-discipline").score).toBe(85);
  });

  it("floors at 0 rather than going negative", () => {
    const s = score(result({
      findings: Array.from({ length: 50 }, () => finding()),
      opportunities: { ...zero(), "wait-discipline": 2 },
    }));
    expect(dim(s, "wait-discipline").score).toBe(0);
  });

  it("averages only the dimensions that are not n/a", () => {
    const s = score(result({
      findings: [finding()],
      opportunities: { ...zero(), "wait-discipline": 10, "locator-quality": 10 },
    }));
    expect(s.hygieneScore).toBe(85); // (70 + 100) / 2
  });

  it("returns a null headline when nothing was measurable", () => {
    expect(score(result()).hygieneScore).toBeNull();
  });

  it("floors a headline that means to 99.5 rather than rounding up to 100", () => {
    // wait-discipline: one info-severity finding, weight 0.25*1=0.25, /25 opps -> density .01 -> dim score 99.
    // locator-quality: no findings, 10 opps -> dim score 100.
    // mean (99 + 100) / 2 = 99.5, which must floor to 99, not round to 100 —
    // a headline of 100 must mean genuinely nothing was found.
    const s = score(result({
      findings: [finding({ severity: "info", dimension: "wait-discipline" })],
      opportunities: { ...zero(), "wait-discipline": 25, "locator-quality": 10 },
    }));
    expect(dim(s, "wait-discipline").score).toBe(99);
    expect(dim(s, "locator-quality").score).toBe(100);
    expect(s.hygieneScore).toBe(99);
  });

  it("still reports 100 for a genuinely clean suite (all measured dimensions 100)", () => {
    const s = score(result({
      opportunities: { ...zero(), "wait-discipline": 10, "locator-quality": 10, "test-isolation": 10 },
    }));
    expect(s.hygieneScore).toBe(100);
  });

  it("always carries the disclaimer and the four blind spots", () => {
    const s = score(result());
    expect(s.disclaimer).toBe(DISCLAIMER);
    expect(s.notMeasured).toHaveLength(4);
  });

  it("asks a question even on a flawless suite", () => {
    const s = score(result({ opportunities: { ...zero(), "wait-discipline": 10 } }));
    expect(s.openQuestions.length).toBeGreaterThan(0);
    expect(s.openQuestions.join(" ")).toMatch(/test design|right scenarios/i);
  });

  it("asks a targeted question about a weak dimension", () => {
    const s = score(result({
      findings: Array.from({ length: 5 }, () => finding({ dimension: "assertion-strength" })),
      opportunities: { ...zero(), "assertion-strength": 20 },
    }));
    expect(s.openQuestions.join(" ")).toMatch(/assertion/i);
  });
});
