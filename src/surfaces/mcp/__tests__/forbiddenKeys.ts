/** Shared by guard.test.ts (direct handler results) and server.test.ts (results
 *  round-tripped through a real MCP client/server transport). One implementation,
 *  so the two tests can never quietly diverge on what "green-light field" means. */
export const FORBIDDEN = ["pass", "passed", "approved", "ready", "ok", "safe", "success"];

export function forbiddenKeys(value: unknown, path = "$"): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => forbiddenKeys(v, `${path}[${i}]`));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => [
      ...(FORBIDDEN.includes(k.toLowerCase()) ? [`${path}.${k}`] : []),
      ...forbiddenKeys(v, `${path}.${k}`),
    ]);
  }
  return [];
}
