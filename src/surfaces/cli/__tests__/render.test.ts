import { describe, it, expect } from "vitest";
import { render } from "../render.js";
import { score } from "../../../core/score.js";
import { DIMENSIONS } from "../../../core/types.js";
import type { Dimension } from "../../../core/types.js";

const zero = () => Object.fromEntries(DIMENSIONS.map((d) => [d, 0])) as Record<Dimension, number>;
const card = score({ findings: [], skipped: [], suppressed: [], opportunities: { ...zero(), "wait-discipline": 5 }, filesScanned: 1 });

describe("render", () => {
  it("always prints the NOT MEASURED block", () => {
    expect(render(card)).toContain("NOT MEASURED");
  });

  it("always prints the disclaimer", () => {
    expect(render(card)).toContain("A high score means your tests are well-written");
  });

  it("prints n/a for an unmeasured dimension, never 100", () => {
    const out = render(card);
    const ciLine = out.split("\n").find((l) => l.includes("CI hygiene"))!;
    expect(ciLine).toContain("n/a");
    expect(ciLine).not.toContain("100");
  });

  it("always prints at least one open question", () => {
    expect(render(card)).toMatch(/Questions for a human/i);
  });

  it("renders a SKIPPED section naming the file and its reason, and states coverage is incomplete", () => {
    const skippedCard = score({
      findings: [],
      skipped: [{ path: "src/broken.spec.ts", reason: "EACCES: permission denied" }],
      suppressed: [],
      opportunities: { ...zero(), "wait-discipline": 5 },
      filesScanned: 1,
    });
    const out = render(skippedCard);
    expect(out).toContain("SKIPPED");
    expect(out).toContain("src/broken.spec.ts");
    expect(out).toContain("EACCES: permission denied");
    expect(out).toMatch(/coverage is incomplete/i);
    expect(out).not.toMatch(/excluded from this score/i);
  });

  it("prints the coverage open question produced by score() when files were skipped", () => {
    const skippedCard = score({
      findings: [],
      skipped: [{ path: "src/broken.spec.ts", reason: "EACCES: permission denied" }],
      suppressed: [],
      opportunities: { ...zero(), "wait-discipline": 5 },
      filesScanned: 1,
    });
    expect(skippedCard.openQuestions.some((q) => q.includes("could not be analysed"))).toBe(true);
    const out = render(skippedCard);
    const coverageQuestion = skippedCard.openQuestions.find((q) => q.includes("could not be analysed"))!;
    expect(out).toContain(coverageQuestion);
  });

  it("renders a SUPPRESSED section listing each suppression's path, line, rule and reason", () => {
    const suppressedCard = score({
      findings: [],
      skipped: [],
      suppressed: [{
        ruleId: "WAIT-001", path: "src/a.spec.ts", line: 4,
        reason: "third-party widget has no ready signal",
      }],
      opportunities: { ...zero(), "wait-discipline": 5 },
      filesScanned: 1,
    });
    const out = render(suppressedCard);
    expect(out).toContain("SUPPRESSED (1)");
    expect(out).toContain("src/a.spec.ts:4");
    expect(out).toContain("WAIT-001");
    expect(out).toContain("third-party widget has no ready signal");
  });

  it("prints no SUPPRESSED section when nothing was suppressed", () => {
    expect(render(card)).not.toContain("SUPPRESSED");
  });

  it("--json-equivalent output: disclaimer and notMeasured (length 4) survive JSON round-trip", () => {
    const json = JSON.stringify(card, null, 2);
    const parsed = JSON.parse(json) as { disclaimer: string; notMeasured: string[] };
    expect(typeof parsed.disclaimer).toBe("string");
    expect(parsed.disclaimer.length).toBeGreaterThan(0);
    expect(Array.isArray(parsed.notMeasured)).toBe(true);
    expect(parsed.notMeasured).toHaveLength(4);
  });
});
