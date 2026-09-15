import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { scanForMarkers, isBinary } from "./check-ip-boundary.js";

const binaries: string[] = [];
const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split("\n").filter(Boolean)
  .filter((p) => !p.startsWith("docs/superpowers/"))   // specs discuss the boundary by name
  .flatMap((p) => {
    try {
      const buf = readFileSync(p);
      if (isBinary(buf)) { binaries.push(p); return []; }
      return [{ path: p, content: buf.toString("utf8") }];
    } catch { return []; }
  });

const violations = scanForMarkers(tracked);
if (violations.length > 0) {
  for (const v of violations) process.stderr.write(`${v.path}:${v.line} [${v.marker}]\n`);
  process.exit(1);
}
if (binaries.length > 0) console.log(`Not scanned (binary, ${binaries.length}): ${binaries.join(", ")}`);
console.log(`IP boundary clean — ${tracked.length} tracked files scanned.`);
