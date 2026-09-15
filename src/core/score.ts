import {
  DIMENSIONS, SEVERITY_WEIGHT, CONFIDENCE_WEIGHT, DISCLAIMER, NOT_MEASURED,
} from "./types.js";
import type { Dimension, DimensionScore, Finding, Scorecard } from "./types.js";
import type { AnalyzeResult } from "./analyze.js";

const WEAK = 80;

const QUESTION_BY_DIMENSION: Record<Dimension, string> = {
  "wait-discipline":
    "Several waits are hardcoded. Which of these hide a real race in the product rather than a slow test?",
  "locator-quality":
    "Locators are coupled to structure. Which screens would a redesign silently break, and who owns that risk?",
  "test-isolation":
    "Tests share state. Which of these would fail if the suite ran in a different order, and is that order guaranteed?",
  "assertion-strength":
    "Assertions are weak or missing. Which of these tests would still pass if the feature broke?",
  "ci-hygiene":
    "CI configuration loses failure evidence. When a test fails at 3am, what will the on-call engineer actually have?",
};

const ALWAYS_ASK =
  "QAIQ measures how tests are written, not what they cover. Who reviewed the test design against the product's real risks?";

function scoreDimension(d: Dimension, findings: Finding[], opportunities: number): DimensionScore {
  const mine = findings.filter((f) => f.dimension === d);
  // Zero opportunities is n/a, never 100 — a suite with no CI config has not
  // earned a perfect CI-hygiene score, and must not raise its headline by omission.
  if (opportunities === 0) {
    return { dimension: d, score: null, findings: mine.length, opportunities: 0 };
  }
  const weighted = mine.reduce(
    (sum, f) => sum + SEVERITY_WEIGHT[f.severity] * CONFIDENCE_WEIGHT[f.confidence], 0,
  );
  const density = weighted / opportunities;
  return {
    dimension: d,
    score: Math.round(100 * (1 - Math.min(1, density))),
    findings: mine.length,
    opportunities,
  };
}

export function score(result: AnalyzeResult): Scorecard {
  const dimensions = DIMENSIONS.map((d) =>
    scoreDimension(d, result.findings, result.opportunities[d]!),
  );

  const measured = dimensions.filter((d) => d.score !== null);
  // Floor, not round: a headline of 100 must mean genuinely nothing was
  // found, never "rounded up from 99.5 while findings are still listed."
  const hygieneScore = measured.length === 0
    ? null
    : Math.floor(measured.reduce((s, d) => s + (d.score ?? 0), 0) / measured.length);

  // Invariant: never empty, even on a perfect score. A clean suite still gets
  // handed a question only a person can answer.
  const openQuestions = [
    ...dimensions
      .filter((d) => d.score !== null && d.score < WEAK)
      .map((d) => QUESTION_BY_DIMENSION[d.dimension]),
    ALWAYS_ASK,
  ];

  if (result.skipped.length > 0) {
    // Not "excluded": a file with one failing rule was still scanned by
    // every other rule, and those findings and opportunities are counted
    // above. What's true is that it could not be analysed by every rule, so
    // its coverage in this score is partial, not complete.
    openQuestions.unshift(
      `${result.skipped.length} file(s) could not be analysed by every rule, so coverage of them in this score is incomplete, not excluded — which of them matter?`,
    );
  }

  return {
    hygieneScore, dimensions,
    findings: result.findings, skipped: result.skipped, suppressed: result.suppressed,
    filesScanned: result.filesScanned,
    notMeasured: NOT_MEASURED, openQuestions, disclaimer: DISCLAIMER,
  };
}
