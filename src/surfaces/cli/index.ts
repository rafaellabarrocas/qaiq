#!/usr/bin/env node
import { analyze } from "../../core/analyze.js";
import { score } from "../../core/score.js";
import { playwrightPack } from "../../rules/playwright/index.js";
import { discover } from "../../io/discover.js";
import { loadConfig } from "../../io/config.js";
import { render } from "./render.js";

const EXIT_OK = 0, EXIT_BELOW_THRESHOLD = 1, EXIT_OPERATIONAL = 2;

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const json = argv.includes("--json");
  const root = argv.find((a) => !a.startsWith("--")) ?? process.cwd();
  const minArg = argv.find((a) => a.startsWith("--min-score="));

  const cfg = await loadConfig(root);
  const minScore = minArg ? Number(minArg.split("=")[1]) : cfg.minScore;

  const { files, unreadable } = await discover(root, cfg);
  if (files.length === 0) {
    // NOT a score of 100 — we measured nothing.
    process.stderr.write(
      `qaiq: no test files found under ${root}\n` +
      `Looked for *.spec.ts, *.test.ts, playwright.config.ts, .github/workflows/*.yml\n`,
    );
    return EXIT_OPERATIONAL;
  }

  const result = analyze(files, playwrightPack);
  const card = score({ ...result, skipped: [...result.skipped, ...unreadable] });
  process.stdout.write(json ? JSON.stringify(card, null, 2) + "\n" : render(card));

  if (minScore != null && card.hygieneScore != null && card.hygieneScore < minScore) {
    return EXIT_BELOW_THRESHOLD;
  }
  return EXIT_OK;
}

main()
  .then((code) => process.exit(code))
  .catch((err: Error) => {
    process.stderr.write(`qaiq: ${err.message}\n`);
    process.exit(EXIT_OPERATIONAL);
  });
