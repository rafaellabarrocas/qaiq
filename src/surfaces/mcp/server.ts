#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { scanTool, reviewSnippetTool, explainRuleTool, listRulesTool } from "./tools.js";

const TOOLS = [scanTool, reviewSnippetTool, explainRuleTool, listRulesTool];

export function createServer(): McpServer {
  const server = new McpServer({ name: "qaiq", version: "0.1.0" });
  for (const t of TOOLS) {
    server.tool(t.name, t.description, t.schema.shape, async (args: Record<string, unknown>) => ({
      content: [{ type: "text" as const, text: JSON.stringify(await t.handler(args as never), null, 2) }],
    }));
  }
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await createServer().connect(new StdioServerTransport());
}
