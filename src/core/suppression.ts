import type { SourceFile, Finding } from "./types.js";

export const SUPPRESSION_RULE_ID = "SUP-001";

export interface Suppression { ruleId: string; reason: string | null; commentLine: number }
export type SuppressionMap = Map<number, Suppression[]>;

const RE = /\/\/\s*qaiq-disable-next-line\s+([A-Z]+-\d+)\s*(?:--\s*(.*))?$/;

/**
 * A reason must be substantive enough that a human plausibly thought about
 * it, not just typed past a lint rule. `-- x` and `-- .` satisfy "has a
 * reason" under a naive non-empty check while conveying nothing — that gap
 * is exactly how a reviewer can launder findings into silence. Both bars
 * (length AND word count) must be cleared; either alone is trivially gamed
 * ("xxxxxxxxxxxxxxx" clears length, "a b c" clears word count).
 */
const MIN_REASON_LENGTH = 15;
const MIN_REASON_WORDS = 3;

function isSubstantiveReason(reason: string): boolean {
  if (reason.length < MIN_REASON_LENGTH) return false;
  return reason.split(/\s+/).filter(Boolean).length >= MIN_REASON_WORDS;
}

export function parseSuppressions(file: SourceFile): SuppressionMap {
  const map: SuppressionMap = new Map();
  file.content.split("\n").forEach((text, i) => {
    const m = RE.exec(text.trim());
    if (!m) return;
    const commentLine = i + 1;
    const reasonRaw = m[2]?.trim() ?? "";
    const entry: Suppression = {
      ruleId: m[1]!,
      // A missing reason AND a non-substantive one (too short, too few
      // words) are both recorded as null: from here on they are
      // indistinguishable, and neither one silences the target rule.
      reason: isSubstantiveReason(reasonRaw) ? reasonRaw : null,
      commentLine,
    };
    const target = commentLine + 1;
    map.set(target, [...(map.get(target) ?? []), entry]);
  });
  return map;
}

/**
 * A suppression only applies when it carries a real reason. A null reason
 * (missing, or present but not substantive) means the rule it targets still
 * reports — the only thing that fires instead is SUP-001.
 */
export function findApplicableSuppression(
  map: SuppressionMap, line: number, ruleId: string,
): Suppression | undefined {
  return (map.get(line) ?? []).find((s) => s.ruleId === ruleId && s.reason !== null);
}

/**
 * wholeFile findings (e.g. CI-001) are attributed to one synthetic line for
 * the whole file, so the usual "comment directly above the target line"
 * convention does not reliably land adjacent to it. Treat a reasoned
 * suppression comment anywhere in the file's first 5 lines as applying to
 * any wholeFile finding for the same rule.
 */
export function findWholeFileSuppression(map: SuppressionMap, ruleId: string): Suppression | undefined {
  for (const list of map.values()) {
    const found = list.find((s) => s.ruleId === ruleId && s.reason !== null && s.commentLine <= 5);
    if (found) return found;
  }
  return undefined;
}

/**
 * A suppression without a reason is itself a finding. This is a deliberate
 * place where a human must think: an agent cannot silence QAIQ by
 * pattern-matching the comment.
 */
export function suppressionFindings(file: SourceFile, map: SuppressionMap): Finding[] {
  const out: Finding[] = [];
  for (const list of map.values()) {
    for (const s of list) {
      if (s.reason !== null) continue;
      out.push({
        ruleId: SUPPRESSION_RULE_ID,
        dimension: "test-isolation",
        severity: "warning",
        confidence: "high",
        title: "Suppression without a reason",
        rationale:
          "A suppression records a deliberate human decision. Without a stated reason nobody can tell later whether it is still valid, and it becomes permanent by accident.",
        path: file.path,
        line: s.commentLine,
        match: `qaiq-disable-next-line ${s.ruleId}`,
      });
    }
  }
  return out;
}
