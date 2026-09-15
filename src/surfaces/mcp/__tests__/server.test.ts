import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../server.js";
import { forbiddenKeys } from "./forbiddenKeys.js";

// Integration test: drives createServer() through a REAL MCP client over an
// in-memory transport (no stdio, no subprocess). tools.ts is exercised
// directly by guard.test.ts; this file is the only thing that proves the
// server actually REGISTERS those tools and serves them in the shape the
// SDK's wire protocol expects — a broken server.tool() registration or a
// wrong content payload would pass every test in guard.test.ts and still
// ship a non-functional MCP surface.

let client: Client;

beforeAll(async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createServer();
  client = new Client({ name: "qaiq-test-client", version: "0.0.0" });
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
});

afterAll(async () => {
  await client.close();
});

describe("MCP server (in-memory transport)", () => {
  it("lists exactly the four critique-only tools, by name", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      ["qaiq_explain_rule", "qaiq_list_rules", "qaiq_review_snippet", "qaiq_scan"].sort(),
    );
  });

  it("every registered tool's description survives registration with the critique-only constraint", async () => {
    const { tools } = await client.listTools();
    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) {
      expect(tool.description ?? "").toMatch(/critique only/i);
    }
  });

  it("no registered tool name implies generation", async () => {
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(tool.name).not.toMatch(/write|generate|create|fix|autofix|apply/i);
    }
  });

  it("qaiq_review_snippet round-trips through a real call and returns critique JSON", async () => {
    const result = await client.callTool({
      name: "qaiq_review_snippet",
      arguments: { code: "test('a', async () => { await page.waitForTimeout(1); });" },
    });

    expect(result.isError).not.toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content).toHaveLength(1);
    expect(content[0]!.type).toBe("text");

    const parsed = JSON.parse(content[0]!.text) as {
      findings: unknown[];
      openQuestions: unknown[];
      disclaimer: string;
    };
    expect(parsed.findings.length).toBeGreaterThan(0);
    expect(parsed.openQuestions.length).toBeGreaterThan(0);
    expect(parsed.disclaimer).toContain("A high score means your tests are well-written");

    // The green-light guard must survive serialization over the wire, not
    // just hold on the in-process object the handler returns.
    expect(forbiddenKeys(parsed)).toEqual([]);
  });

  it("qaiq_explain_rule with an unknown rule id surfaces an error, not an empty success result", async () => {
    const result = await client.callTool({
      name: "qaiq_explain_rule",
      arguments: { ruleId: "NOT-A-REAL-RULE" },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0]!.text).toContain("Unknown rule");
  });
});
