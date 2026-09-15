import type { Scorecard, DimensionScore } from "../../core/types.js";

const LABEL: Record<string, string> = {
  "wait-discipline": "Wait discipline", "locator-quality": "Locator quality",
  "test-isolation": "Test isolation", "assertion-strength": "Assertion strength",
  "ci-hygiene": "CI hygiene",
};

function bar(d: DimensionScore): string {
  if (d.score === null) return `${"·".repeat(10)}  n/a`;
  const filled = Math.round(d.score / 10);
  return `${"█".repeat(filled)}${"░".repeat(10 - filled)}  ${String(d.score).padStart(3)}`;
}

export function render(card: Scorecard): string {
  const L: string[] = [];
  L.push("");
  L.push(`  Hygiene Score  ${card.hygieneScore ?? "n/a"}${card.hygieneScore === null ? "" : "/100"}`);
  L.push("");
  for (const d of card.dimensions) L.push(`  ${LABEL[d.dimension]!.padEnd(20)}${bar(d)}`);
  L.push("");

  if (card.findings.length > 0) {
    L.push(`  FINDINGS (${card.findings.length})`);
    for (const f of card.findings.slice(0, 20)) {
      const flag = f.confidence === "heuristic" ? " ~" : "  ";
      L.push(`  ${flag}${f.path}:${f.line}  ${f.ruleId}  ${f.title}`);
    }
    if (card.findings.length > 20) L.push(`     … ${card.findings.length - 20} more (use --json for all)`);
    L.push("");
    L.push("  ~ = heuristic rule, weighted at half. Confirm before acting.");
    L.push("");
  }

  if (card.skipped.length > 0) {
    L.push(`  SKIPPED (${card.skipped.length}) — partially analysed, so coverage is incomplete`);
    for (const s of card.skipped) L.push(`    ${s.path}: ${s.reason}`);
    L.push("");
  }

  if (card.suppressed.length > 0) {
    L.push(`  SUPPRESSED (${card.suppressed.length})`);
    for (const s of card.suppressed) L.push(`    ${s.path}:${s.line}  ${s.ruleId} — ${s.reason}`);
    L.push("");
  }

  L.push("  NOT MEASURED — these need a human");
  for (const n of card.notMeasured) L.push(`   · ${n}`);
  L.push("");
  L.push("  Questions for a human");
  for (const q of card.openQuestions) L.push(`   ? ${q}`);
  L.push("");
  L.push(`  ${card.disclaimer}`);
  L.push("");
  return L.join("\n");
}
