import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import type { SourceFile, SkippedFile } from "../core/types.js";
import type { QaiqConfig } from "./config.js";

export interface DiscoverResult {
  files: SourceFile[];
  unreadable: SkippedFile[];
}

const SPEC = /\.(spec|test)\.[cm]?[jt]sx?$/;
const CONFIG = /playwright\.config\.[cm]?[jt]s$/;

function isTarget(rel: string): boolean {
  if (SPEC.test(rel) || CONFIG.test(rel)) return true;
  return rel.split(sep).join("/").includes(".github/workflows/") && /\.ya?ml$/.test(rel);
}

export async function discover(root: string, cfg: QaiqConfig): Promise<DiscoverResult> {
  const files: SourceFile[] = [];
  const unreadable: SkippedFile[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = join(dir, e.name);
      const rel = relative(root, full);
      if (cfg.exclude.some((x) => rel.split(sep).includes(x))) continue;
      if (e.isDirectory()) { await walk(full); continue; }
      if (!isTarget(rel)) continue;
      try {
        files.push({ path: rel, content: await readFile(full, "utf8") });
      } catch (err) {
        // Record unreadable files so callers can surface them in the scorecard.
        // Files that matched the target pattern but could not be read are surfaced
        // as skipped, not silently dropped — a missing file removes violations from
        // the denominator and artificially raises the score.
        unreadable.push({ path: rel, reason: (err as Error).message });
      }
    }
  }

  await walk(root);
  return { files, unreadable };
}
