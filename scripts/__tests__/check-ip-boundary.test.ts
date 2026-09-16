import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanForMarkers, isBinary, readScannable, SENTINEL } from "../check-ip-boundary.js";

const f = (content: string) => [{ path: "x.ts", content }];

describe("scanForMarkers", () => {
  it("catches a playbook id", () => {
    expect(scanForMarkers(f("see dev-04-safe-implementation"))).toHaveLength(1); // ip-boundary-allow
  });
  it("catches a second-brain path", () => { // ip-boundary-allow
    expect(scanForMarkers(f("/home/x/second-brain/knowledge-base/qa-playbook"))).toHaveLength(1); // ip-boundary-allow
  });
  it("catches router vocabulary", () => {
    expect(scanForMarkers(f("Run Playbook QA-03 and return the template"))).toHaveLength(1); // ip-boundary-allow
  });
  it("reports the offending line number", () => {
    expect(scanForMarkers(f("clean\nclean\ndev-01-ticket-triage"))[0]?.line).toBe(3); // ip-boundary-allow
  });
  it("stays silent on ordinary QAIQ source", () => {
    expect(scanForMarkers(f("export const waitRules = []; // WAIT-001 hardcoded wait"))).toHaveLength(0);
  });
  it("does not fire on the rule ids QAIQ legitimately ships", () => {
    expect(scanForMarkers(f("CI-001, WAIT-005, LOC-004, ISO-003, ASR-002"))).toHaveLength(0);
  });

  // Round-1 fix: bare playbook-id citations (no descriptive slug, punctuation-
  // adjacent, underscored, uppercase, band > 07) were previously missed.
  it("catches bare playbook-id citations in the wild", () => {
    expect(scanForMarkers(f("see qa-03 for details"))).toHaveLength(1); // ip-boundary-allow
    expect(scanForMarkers(f("ops-05."))).toHaveLength(1); // ip-boundary-allow
    expect(scanForMarkers(f("dev-01, dev-02, dev-03"))).toHaveLength(1); // ip-boundary-allow
    expect(scanForMarkers(f("(ops-03,triage-checklist)"))).toHaveLength(1); // ip-boundary-allow
    expect(scanForMarkers(f("dev_04_safe_implementation"))).toHaveLength(1); // ip-boundary-allow
    expect(scanForMarkers(f("QA03"))).toHaveLength(1); // ip-boundary-allow
    expect(scanForMarkers(f("dev-08-new-band-entry"))).toHaveLength(1); // ip-boundary-allow
  });

  // Round-1 fix: an unreadable staged file must fail the gate closed, not
  // vanish from the scan. Only runs where the process cannot read its own
  // 0o000 file (skipped when running as root, e.g. some CI containers).
  it("fails closed when a staged file cannot be read", () => {
    const dir = mkdtempSync(join(tmpdir(), "qaiq-ip-boundary-"));
    const path = join(dir, "unreadable.ts");
    writeFileSync(path, "clean");
    chmodSync(path, 0o000);
    try {
      let blocked = true;
      try {
        readFileSync(path, "utf8");
        blocked = false; // running as a user that ignores 0o000 (e.g. root)
      } catch {
        // expected: the OS itself refuses the read
      }
      if (!blocked) {
        console.warn("skipping fail-closed assertion: process can read 0o000 files (root?)");
        return;
      }
      expect(() => readScannable(path)).toThrow(/cannot read staged file/);
    } finally {
      chmodSync(path, 0o600);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // FIX 2 (final review wave): the gate previously read the WORKING TREE
  // (readFileSync(path)) after listing staged paths, so stage a marker then
  // edit it clean and the gate saw the clean working copy while the staged
  // blob — what would actually be committed — still carried the marker.
  // readScannable now reads via `git show :<path>`, the staged content.
  it("catches a marker that is staged but has since been edited out of the working tree", () => {
    const dir = mkdtempSync(join(tmpdir(), "qaiq-ip-boundary-stage-"));
    try {
      execFileSync("git", ["init", "-q"], { cwd: dir });
      execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
      execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });
      const target = join(dir, "marker.ts");
      writeFileSync(target, "see dev-04-safe-implementation\n"); // ip-boundary-allow
      execFileSync("git", ["add", "marker.ts"], { cwd: dir });

      // Ordinary mid-edit state: the working copy is now clean, but nothing
      // has been re-staged, so the index blob still carries the marker.
      writeFileSync(target, "clean content\n");

      const staged = readScannable("marker.ts", dir);
      expect(staged.content).toContain("dev-04-safe-implementation"); // ip-boundary-allow
      expect(scanForMarkers([staged])).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Round-1 fix: the self-exclusion this replaced (whole-file, by path) was
  // a proven hole -- real playbook content could be added to the guard's
  // own files and committed unblocked. The per-line sentinel is narrower,
  // but only if it cannot spread: assert it appears nowhere else in the
  // tracked tree.
  it("the allow-sentinel appears only in the guard's own two files", () => {
    const allowedPaths = new Set([
      "scripts/check-ip-boundary.ts",
      "scripts/__tests__/check-ip-boundary.test.ts",
    ]);
    const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
    const offenders = tracked
      .filter((path) => !allowedPaths.has(path))
      .filter((path) => {
        try {
          return readFileSync(path, "utf8").includes(SENTINEL);
        } catch {
          return false;
        }
      });
    expect(offenders).toEqual([]);
  });
});

describe("binary files", () => {
  it("treats content with NUL bytes as binary", () => {
    expect(isBinary(Buffer.from([0x47, 0x49, 0x46, 0x00, 0x21]))).toBe(true);
  });

  it("treats ordinary text as not binary", () => {
    expect(isBinary(Buffer.from("see dev-04-safe-implementation", "utf8"))).toBe(false); // ip-boundary-allow
  });

  it("still flags a marker in a TEXT file — binary handling must not create a hole", () => {
    expect(scanForMarkers([{ path: "x.md", content: "see qa-03 for details" }])).toHaveLength(1); // ip-boundary-allow
  });
});

describe("large files", () => {
  it("reads a staged file bigger than the 1MB execFileSync default", () => {
    const dir = mkdtempSync(join(tmpdir(), "qaiq-big-"));
    try {
      execFileSync("git", ["init", "-q"], { cwd: dir });
      // 3MB of binary — larger than the default buffer, and NUL-bearing
      writeFileSync(join(dir, "big.bin"), Buffer.alloc(3 * 1024 * 1024, 0));
      execFileSync("git", ["add", "big.bin"], { cwd: dir });
      const f = readScannable("big.bin", dir);
      expect((f as { binary?: boolean }).binary).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
