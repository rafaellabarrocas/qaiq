import { describe, it, expect } from "vitest";
import { SEVERITY_WEIGHT, CONFIDENCE_WEIGHT, DISCLAIMER, NOT_MEASURED } from "../types.js";

describe("core constants", () => {
  it("weights severities per spec", () => {
    expect(SEVERITY_WEIGHT).toEqual({ error: 3, warning: 1, info: 0.25 });
  });
  it("halves heuristic confidence", () => {
    expect(CONFIDENCE_WEIGHT).toEqual({ high: 1, heuristic: 0.5 });
  });
  it("states the limitation verbatim", () => {
    expect(DISCLAIMER).toBe(
      "QAIQ scores test-code hygiene only. A high score means your tests are well-written — not that your product is well-tested."
    );
  });
  it("lists four things it cannot measure", () => {
    expect(NOT_MEASURED).toHaveLength(4);
    expect(NOT_MEASURED[0]).toMatch(/risk coverage/);
  });
});
