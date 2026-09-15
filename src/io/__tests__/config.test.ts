import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, DEFAULT_CONFIG } from "../config.js";

let root: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "qaiq-config-"));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("loadConfig", () => {
  it("returns DEFAULT_CONFIG when qaiq.config.json is absent", async () => {
    const cfg = await loadConfig(root);
    expect(cfg).toEqual(DEFAULT_CONFIG);
  });

  it("throws with file name when JSON is invalid", async () => {
    await writeFile(join(root, "qaiq.config.json"), "{ invalid json");
    await expect(loadConfig(root)).rejects.toThrow("qaiq.config.json");
  });

  it("throws when minScore exceeds 100", async () => {
    await rm(join(root, "qaiq.config.json"), { force: true });
    await writeFile(join(root, "qaiq.config.json"), '{"minScore": 150}');
    await expect(loadConfig(root)).rejects.toThrow("minScore");
  });

  it("throws when minScore is not a number", async () => {
    await rm(join(root, "qaiq.config.json"), { force: true });
    await writeFile(join(root, "qaiq.config.json"), '{"minScore": "high"}');
    await expect(loadConfig(root)).rejects.toThrow("minScore");
  });

  it("returns config with custom minScore when valid", async () => {
    await rm(join(root, "qaiq.config.json"), { force: true });
    await writeFile(join(root, "qaiq.config.json"), '{"minScore": 80}');
    const cfg = await loadConfig(root);
    expect(cfg.minScore).toBe(80);
  });

  it("throws when exclude is not an array", async () => {
    await rm(join(root, "qaiq.config.json"), { force: true });
    await writeFile(join(root, "qaiq.config.json"), '{"exclude": "not-an-array"}');
    await expect(loadConfig(root)).rejects.toThrow("exclude");
  });

  it("throws when exclude contains non-strings", async () => {
    await rm(join(root, "qaiq.config.json"), { force: true });
    await writeFile(join(root, "qaiq.config.json"), '{"exclude": ["node_modules", 123]}');
    await expect(loadConfig(root)).rejects.toThrow("exclude");
  });

  it("returns config with custom exclude when valid", async () => {
    await rm(join(root, "qaiq.config.json"), { force: true });
    await writeFile(join(root, "qaiq.config.json"), '{"exclude": ["custom"]}');
    const cfg = await loadConfig(root);
    expect(cfg.exclude).toEqual(["custom"]);
  });
});
