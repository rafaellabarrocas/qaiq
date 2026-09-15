import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface QaiqConfig { exclude: string[]; minScore: number | null }

export const DEFAULT_CONFIG: QaiqConfig = {
  exclude: ["node_modules", "dist", "build", ".git", "coverage"],
  minScore: null,
};

export async function loadConfig(root: string): Promise<QaiqConfig> {
  let raw: string;
  try {
    raw = await readFile(join(root, "qaiq.config.json"), "utf8");
  } catch {
    return DEFAULT_CONFIG;                     // absent config is fine
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    // Fail fast, naming the file — never fall back silently to defaults.
    throw new Error(`qaiq.config.json is not valid JSON: ${(err as Error).message}`, { cause: err });
  }
  const cfg = parsed as Partial<QaiqConfig>;
  if (cfg.minScore != null && (typeof cfg.minScore !== "number" || cfg.minScore < 0 || cfg.minScore > 100)) {
    throw new Error("qaiq.config.json: 'minScore' must be a number between 0 and 100");
  }
  if (cfg.exclude != null && (!Array.isArray(cfg.exclude) || !cfg.exclude.every((x) => typeof x === "string"))) {
    throw new Error("qaiq.config.json: 'exclude' must be an array of strings");
  }
  return { ...DEFAULT_CONFIG, ...cfg };
}
