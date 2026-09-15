import { execFileSync } from "node:child_process";
import type { SourceFile } from "../src/core/types.js";

export interface Violation { path: string; line: number; marker: string }

/**
 * Judgment-layer markers. Publishing is a Type 1 door and git history is
 * permanent, so this guard runs pre-commit AND in CI, and it is tuned to
 * bias toward false positives on purpose: a blocked commit costs the author
 * a few seconds to read and override deliberately, a missed marker is a
 * permanent public leak in every clone and fork. When a pattern below is
 * ambiguous, it is written to catch too much rather than too little.
 *
 * QAIQ's own rule ids (CI-001, WAIT-005, LOC-004, ISO-003, ASR-002, ...)
 * do not collide with these patterns: none of QAIQ's prefixes match the
 * private corpus's three department prefixes.
 *
 * A line can be exempted from every pattern below by ending it with the
 * exact comment "// ip-boundary-allow" (see SENTINEL). That escape hatch
 * exists for exactly two files — this one and its test — where the private
 * vocabulary legitimately has to appear literally, as regex source or test
 * fixtures. A test greps every tracked file and asserts the sentinel
 * appears only in those two, so the exemption cannot quietly spread into
 * real source.
 */
export const SENTINEL = "// ip-boundary-allow";

const MARKERS: Array<[string, RegExp]> = [
  // Trailing lookahead (not \b): \b does not fire between a digit and an
  // underscore (both are \w), which would silently miss an underscored
  // citation like "dev_04_safe_implementation" -- one of the exact cases // ip-boundary-allow
  // this pattern exists to catch. (?!\d) still caps the run at 1-2 digits.
  ["playbook-id", /\b(dev|qa|ops)[-_ ]?\d{1,2}(?!\d)/i],
  ["playbook-reference", /\bplaybook\s+(dev|qa|ops)-\d/i],
  ["second-brain", /second-brain/i], // ip-boundary-allow
  ["knowledge-base-band", /\b(qa|dev|ops)-playbook\b/i],
  ["router-vocabulary", /routing table|resolution ids|brevity mandate/i], // ip-boundary-allow
];

export function scanForMarkers(files: SourceFile[]): Violation[] {
  const out: Violation[] = [];
  for (const file of files) {
    file.content.split("\n").forEach((line, i) => {
      if (line.trimEnd().endsWith(SENTINEL)) return;
      // A line can trip more than one pattern (e.g. a private-corpus path
      // that also contains a knowledge-base-band token); report the first
      // match only so one dangerous line yields one violation, not several.
      for (const [marker, re] of MARKERS) {
        if (re.test(line)) {
          out.push({ path: file.path, line: i + 1, marker });
          break;
        }
      }
    });
  }
  return out;
}

/**
 * Reads one file's STAGED content directly from the git index, via
 * `git show :<path>` — NOT `readFileSync(path)`. The working tree can
 * legitimately differ from what is staged (stage a file, then keep editing
 * it — an ordinary mid-edit state); reading the working tree would let a
 * staged blob that still carries a marker slip past this gate while the
 * file on disk looks clean. This is deliberately fail-closed: any failure
 * to read the staged blob (path not staged, git error, anything) throws
 * rather than being silently dropped from the scan. A gate whose entire
 * purpose is "nothing passes unnoticed" must never let an unreadable file
 * vanish from its own accounting.
 */
/**
 * A file whose staged bytes contain NUL is binary (an image, font, archive).
 * Decoding it as UTF-8 produces mojibake that matches markers by chance — a
 * 342KB GIF tripped [playbook-id] on random bytes. Those false positives are
 * what teach a developer to reach for --no-verify, which costs more than the
 * theoretical coverage. Binary files are NOT silently ignored: the CLI lists
 * every one it skipped, so a suspicious binary is still a human's call.
 */
export function isBinary(buf: Buffer): boolean {
  return buf.subarray(0, 8000).includes(0);
}

export function readScannable(path: string, cwd: string = process.cwd()): SourceFile & { binary?: boolean } {
  try {
    const buf = execFileSync("git", ["show", `:${path}`], {
      cwd, stdio: ["ignore", "pipe", "pipe"],
    }) as unknown as Buffer;
    if (isBinary(buf)) return { path, content: "", binary: true };
    return { path, content: buf.toString("utf8") };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`cannot read staged file "${path}": ${message}`, { cause: err });
  }
}

function stagedFiles(): SourceFile[] {
  const out = execFileSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACM"], { encoding: "utf8" });
  return out.split("\n").filter(Boolean).map((p) => readScannable(p));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const staged = stagedFiles();
    const binaries = staged.filter((f) => (f as { binary?: boolean }).binary);
    if (binaries.length > 0) {
      // Surfaced, never silent: a binary QAIQ could not read as text is still
      // a human's judgement call, so it is named rather than quietly dropped.
      process.stderr.write(
        `\nNot scanned (binary, ${binaries.length}): ` +
        binaries.map((f) => f.path).join(", ") +
        "\n  Text markers cannot be matched in binary content. If any of these\n" +
        "  could carry private material, review it yourself before committing.\n",
      );
    }
    const violations = scanForMarkers(staged);
    if (violations.length > 0) {
      process.stderr.write("\nIP BOUNDARY VIOLATION — refusing to commit.\n\n");
      for (const v of violations) process.stderr.write(`  ${v.path}:${v.line}  [${v.marker}]\n`);
      process.stderr.write(
        "\nThis content belongs to the private judgment layer and must never enter\n" +
        "a public repository. Git history is permanent: a later deletion does not\n" +
        "undo a push.\n\n",
      );
      process.exit(1);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(
      "\nIP BOUNDARY CHECK FAILED — refusing to commit rather than skip a file it\n" +
      `could not read.\n\n  ${message}\n\n`,
    );
    process.exit(1);
  }
}
