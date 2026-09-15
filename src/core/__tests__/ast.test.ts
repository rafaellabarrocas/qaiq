import { describe, it, expect } from "vitest";
import { parse, countTestCalls } from "../detectors/ast.js";

describe("parse", () => {
  it("parses valid TypeScript", () => {
    expect(() => parse({ path: "a.spec.ts", content: "const x: number = 1;" })).not.toThrow();
  });

  it("throws on a syntax error so analyze() can record it as skipped", () => {
    // This is what stops an unparseable file silently RAISING the score.
    expect(() => parse({ path: "a.spec.ts", content: "const x: = ;;;(" })).toThrow(/parse error/);
  });
});

describe("countTestCalls", () => {
  it("counts test() invocations", () => {
    const src = "test('a', async () => {}); test('b', async () => {});";
    expect(countTestCalls({ path: "a.spec.ts", content: src })).toBe(2);
  });
});
