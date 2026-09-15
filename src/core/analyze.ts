import { DIMENSIONS } from "./types.js";
import type {
  Dimension, Finding, RulePack, SkippedFile, SourceFile, Rule, SuppressionRecord,
} from "./types.js";
import { runPattern, countPatternOpportunities } from "./detectors/pattern.js";
import {
  parseSuppressions, findApplicableSuppression, findWholeFileSuppression, suppressionFindings,
} from "./suppression.js";

export interface AnalyzeResult {
  findings: Finding[];
  skipped: SkippedFile[];
  suppressed: SuppressionRecord[];
  opportunities: Record<Dimension, number>;
  filesScanned: number;
}

function inScope(rule: Rule, path: string): boolean {
  const scope = rule.detect.scope;
  if (scope === "any") return true;
  if (scope === "spec") return /\.(spec|test)\.[cm]?[jt]sx?$/.test(path);
  // Normalise Windows-style separators the same way discover.ts does before
  // testing the workflows path, so CI rules still route on Windows.
  const normalized = path.replace(/\\/g, "/");
  return /playwright\.config\.[cm]?[jt]s$/.test(normalized) || normalized.includes(".github/workflows/");
}

const emptyOpportunities = (): Record<Dimension, number> =>
  Object.fromEntries(DIMENSIONS.map((d) => [d, 0])) as Record<Dimension, number>;

/**
 * Tracks (file, reason) accumulation while scanning so one file with several
 * failing rules yields exactly one skipped entry — not one per rule. The
 * first reason is kept verbatim (existing consumers match on its text); a
 * trailing note records how many additional rules also failed on that file.
 */
class SkipTracker {
  private byPath = new Map<string, { reason: string; count: number }>();

  record(path: string, reason: string): void {
    const existing = this.byPath.get(path);
    if (existing) {
      existing.count++;
    } else {
      this.byPath.set(path, { reason, count: 1 });
    }
  }

  toList(): SkippedFile[] {
    return [...this.byPath.entries()].map(([path, { reason, count }]) => ({
      path,
      reason: count > 1
        ? `${reason} (and ${count - 1} more rule failure${count - 1 === 1 ? "" : "s"} on this file)`
        : reason,
    }));
  }
}

export function analyze(files: SourceFile[], pack: RulePack): AnalyzeResult {
  const findings: Finding[] = [];
  const suppressed: SuppressionRecord[] = [];
  const skipTracker = new SkipTracker();
  const opportunities = emptyOpportunities();
  let filesScanned = 0;

  for (const file of files) {
    let suppressions;
    try {
      suppressions = parseSuppressions(file);
    } catch (err) {
      // A file we cannot read must be visible, never silently dropped —
      // dropping it would quietly RAISE the score.
      skipTracker.record(file.path, (err as Error).message);
      continue;
    }
    filesScanned++;
    findings.push(...suppressionFindings(file, suppressions));

    for (const rule of pack.rules) {
      if (!inScope(rule, file.path)) continue;
      try {
        const d = rule.detect;
        const isWholeFile = d.kind === "pattern" && d.wholeFile === true;
        const hits = d.kind === "pattern" ? runPattern(d, file) : d.visit(file);
        opportunities[rule.dimension] +=
          d.kind === "pattern" ? countPatternOpportunities(d, file) : d.countOpportunities(file);

        for (const hit of hits) {
          const applicable = findApplicableSuppression(suppressions, hit.line, rule.id)
            ?? (isWholeFile ? findWholeFileSuppression(suppressions, rule.id) : undefined);
          if (applicable) {
            suppressed.push({ ruleId: rule.id, path: file.path, line: hit.line, reason: applicable.reason! });
            continue;
          }
          findings.push({
            ruleId: rule.id, dimension: rule.dimension, severity: rule.severity,
            confidence: rule.confidence, title: rule.title, rationale: rule.rationale,
            path: file.path, line: hit.line, match: hit.match,
          });
        }
      } catch (err) {
        skipTracker.record(file.path, `${rule.id}: ${(err as Error).message}`);
      }
    }
  }

  return { findings, skipped: skipTracker.toList(), suppressed, opportunities, filesScanned };
}
