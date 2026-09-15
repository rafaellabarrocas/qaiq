import type { RulePack } from "./types.js";

export function validatePack(pack: RulePack): void {
  const seen = new Set<string>();
  for (const r of pack.rules) {
    if (seen.has(r.id)) throw new Error(`Duplicate rule id: ${r.id}`);
    seen.add(r.id);
    if (!r.fixtures?.triggers || !r.fixtures?.clean) {
      throw new Error(`Rule ${r.id} is missing a fixture pair`);
    }
    if (!r.rationale || r.rationale.length < 40) {
      throw new Error(`Rule ${r.id} needs a rationale explaining WHY it matters`);
    }
  }
}
