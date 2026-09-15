export type Dimension =
  | "wait-discipline" | "locator-quality" | "test-isolation"
  | "assertion-strength" | "ci-hygiene";

export const DIMENSIONS: Dimension[] = [
  "wait-discipline", "locator-quality", "test-isolation",
  "assertion-strength", "ci-hygiene",
];

export type Severity = "error" | "warning" | "info";
export type Confidence = "high" | "heuristic";
export type FileScope = "spec" | "config" | "any";

export const SEVERITY_WEIGHT: Record<Severity, number> = { error: 3, warning: 1, info: 0.25 };
export const CONFIDENCE_WEIGHT: Record<Confidence, number> = { high: 1, heuristic: 0.5 };

export const DISCLAIMER =
  "QAIQ scores test-code hygiene only. A high score means your tests are well-written — not that your product is well-tested.";

export const NOT_MEASURED: string[] = [
  "Whether you tested the right things (risk coverage)",
  "Whether your assertions match real intent (oracle correctness)",
  "Whether the gaps that matter are covered (test design)",
  "Whether this is safe to release (release judgment)",
];

export interface SourceFile { path: string; content: string }
export interface RawHit { line: number; match: string }

export interface PatternDetector {
  kind: "pattern";
  scope: FileScope;
  pattern: RegExp;
  /** Counts normalisation opportunities in a file. Required. */
  opportunity: RegExp;
  /** Match against the whole file rather than line by line. Required for
   *  absence checks and for patterns that legitimately span lines. */
  wholeFile?: boolean;
}

export interface AstDetector {
  kind: "ast";
  scope: FileScope;
  visit: (file: SourceFile) => RawHit[];
  countOpportunities: (file: SourceFile) => number;
}

export type Detector = PatternDetector | AstDetector;

export interface Rule {
  id: string;
  dimension: Dimension;
  severity: Severity;
  confidence: Confidence;
  title: string;
  rationale: string;
  detect: Detector;
  examples: { bad: string; good: string };
  /** One snippet that MUST trigger this rule, one that MUST NOT.
   *  The must-not half is the important half: false positives are the
   *  primary credibility risk for a public tool. */
  fixtures: { triggers: string; clean: string };
}

export interface RulePack { name: string; framework: string; rules: Rule[] }

export interface Finding {
  ruleId: string; dimension: Dimension; severity: Severity; confidence: Confidence;
  title: string; rationale: string; path: string; line: number; match: string;
}

export interface SkippedFile { path: string; reason: string }

/** Every suppression that actually silenced a finding, so a reader can see
 *  the score was reached with suppressions rather than a genuinely clean run. */
export interface SuppressionRecord { ruleId: string; path: string; line: number; reason: string }

export interface DimensionScore {
  dimension: Dimension;
  /** null means n/a — zero opportunities. Never coerce to 100. */
  score: number | null;
  findings: number;
  opportunities: number;
}

export interface Scorecard {
  hygieneScore: number | null;
  dimensions: DimensionScore[];
  findings: Finding[];
  skipped: SkippedFile[];
  suppressed: SuppressionRecord[];
  filesScanned: number;
  notMeasured: string[];
  openQuestions: string[];
  disclaimer: string;
}
