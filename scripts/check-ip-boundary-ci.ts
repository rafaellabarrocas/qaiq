import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { scanForMarkers } from "./check-ip-boundary.js";

const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split("\n").filter(Boolean)
  .filter((p) => !p.startsWith("docs/superpowers/"))   // specs discuss the boundary by name
  .flatMap((p) => { try { return [{ path: p, content: readFileSync(p, "utf8") }]; } catch { return []; } });

const violations = scanForMarkers(tracked);
if (violations.length > 0) {
  for (const v of violations) process.stderr.write(`${v.path}:${v.line} [${v.marker}]\n`);
  process.exit(1);
}
console.log(`IP boundary clean — ${tracked.length} tracked files scanned.`);
