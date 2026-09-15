import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, mkdir, writeFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discover } from "../discover.js";
import { DEFAULT_CONFIG } from "../config.js";

let root: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "qaiq-"));
  await mkdir(join(root, "tests"), { recursive: true });
  await mkdir(join(root, "node_modules/pkg"), { recursive: true });
  await writeFile(join(root, "tests/a.spec.ts"), "test('a', () => {});");
  await writeFile(join(root, "tests/helper.ts"), "export const x = 1;");
  await writeFile(join(root, "playwright.config.ts"), "export default defineConfig({});");
  await writeFile(join(root, "node_modules/pkg/b.spec.ts"), "test('b', () => {});");
});
afterAll(async () => { await rm(root, { recursive: true, force: true }); });

describe("discover", () => {
  it("finds spec files and the playwright config", async () => {
    const files = (await discover(root, DEFAULT_CONFIG)).files.map((f) => f.path);
    expect(files.some((p) => p.endsWith("a.spec.ts"))).toBe(true);
    expect(files.some((p) => p.endsWith("playwright.config.ts"))).toBe(true);
  });

  it("never descends into node_modules", async () => {
    const files = (await discover(root, DEFAULT_CONFIG)).files.map((f) => f.path);
    expect(files.some((p) => p.includes("node_modules"))).toBe(false);
  });

  it("reads file contents", async () => {
    const result = await discover(root, DEFAULT_CONFIG);
    expect(result.files.find((f) => f.path.endsWith("a.spec.ts"))?.content).toContain("test(");
  });

  it("surfaces unreadable files", async () => {
    const unreadableFile = join(root, "unreadable.spec.ts");
    await writeFile(unreadableFile, "test('unreadable', () => {});");
    await chmod(unreadableFile, 0o000);
    try {
      const result = await discover(root, DEFAULT_CONFIG);
      expect(result.unreadable.some((u) => u.path.endsWith("unreadable.spec.ts"))).toBe(true);
      expect(result.unreadable.find((u) => u.path.endsWith("unreadable.spec.ts"))?.reason).toBeTruthy();
    } finally {
      await chmod(unreadableFile, 0o644);
      await rm(unreadableFile, { force: true });
    }
  });
});
