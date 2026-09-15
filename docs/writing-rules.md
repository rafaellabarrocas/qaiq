# Writing a rule

A rule is a plain object matching the `Rule` interface in
`src/core/types.ts`. This document walks that interface field by field, then
covers the two detector kinds and the fixture requirement that gates every
merge.

## The `Rule` interface

```ts
export interface Rule {
  id: string;
  dimension: Dimension;
  severity: Severity;
  confidence: Confidence;
  title: string;
  rationale: string;
  detect: Detector;
  examples: { bad: string; good: string };
  fixtures: { triggers: string; clean: string };
}
```

- **`id`** — a short, stable identifier, `PREFIX-NNN` (`WAIT-001`,
  `LOC-002`, ...). Pick a prefix per rule pack and keep the numbering dense;
  ids are quoted in suppressions (`qaiq-disable-next-line WAIT-001`) and in
  `qaiq_explain_rule`, so once published, treat a rename as a breaking
  change.

- **`dimension`** — one of the five `Dimension` values (`wait-discipline`,
  `locator-quality`, `test-isolation`, `assertion-strength`, `ci-hygiene`).
  Findings roll up into their dimension's score; a rule's dimension has to
  match what it is actually judging, because that is also what determines
  which `openQuestions` entry a failing score surfaces.

- **`severity`** — `"error" | "warning" | "info"`. Feeds `SEVERITY_WEIGHT`
  (3 / 1 / 0.25) when a finding is scored against its dimension's
  opportunity count. Reach for `error` only when the pattern is close to
  always wrong; reach for `info` when it is more a style nit than a risk.

- **`confidence`** — `"high" | "heuristic"`. Feeds `CONFIDENCE_WEIGHT`
  (1 / 0.5). `high` means the pattern is unambiguous — if it matches, it is
  wrong. `heuristic` means the pattern is a reasonable signal but can have
  legitimate exceptions (QAIQ cannot see inside helper functions, cannot
  know your team's conventions, etc.). Heuristic findings render with a `~`
  flag in the CLI and are weighted at half. When in doubt, use `heuristic` —
  overclaiming confidence is the more expensive mistake for a public tool.

- **`title`** — a short label shown in findings output and in
  `qaiq_list_rules`. One line, no trailing punctuation.

- **`rationale`** — the *why*, not just the *what*. This is the text a user
  reads when they want to know whether to trust the finding or suppress it.
  Explain the failure mode the pattern leads to, not just what the pattern
  matches.

- **`detect`** — the `Detector` that finds violations and counts
  opportunities. See below.

- **`examples`** — `{ bad, good }` snippets shown by `qaiq_explain_rule`.
  These are static documentation, identical for every caller, never derived
  from the user's own code. Keep them short and realistic.

- **`fixtures`** — `{ triggers, clean }`. See
  [The fixture pair](#the-fixture-pair-mandatory) below — this field is not
  optional in practice even though TypeScript alone won't stop you omitting
  it, because `src/rules/playwright/__tests__/fixtures.test.ts` iterates
  every rule in every pack and asserts both halves hold.

## The two detector kinds

### `pattern`

```ts
export interface PatternDetector {
  kind: "pattern";
  scope: FileScope;
  pattern: RegExp;
  opportunity: RegExp;
  wholeFile?: boolean;
}
```

A regex-based detector. `pattern` is what counts as a violation;
`opportunity` is what counts as a chance to get this right — the
denominator the finding is scored against (for example, `WAIT-001`'s
`opportunity` is every `await`, because every `await` was a chance to wait
correctly).

`scope` limits which discovered files the rule runs against: `"spec"` for
test files, `"config"` for `playwright.config.*` and CI workflow files, or
`"any"`.

By default the pattern is evaluated line by line, which is right for most
violations and keeps reported line numbers exact. Set **`wholeFile: true`**
when the rule cannot be expressed per line — an absence check (`CI-001`
looks for `defineConfig` with no `trace:` anywhere in the file) or a pattern
that legitimately spans multiple lines (`WAIT-005`'s retry-loop pattern).
`wholeFile` detectors report only the first match's line.

Every `pattern` match is run through a **string-literal filter** before it
becomes a finding: if the match falls entirely inside a string or template
literal (as determined by tokenizing the file with the TypeScript scanner),
it is dropped. This exists so a rule doesn't fire on a code sample embedded
in a string, a snapshot fixture, or a commented-out example that happens to
still be inside quotes. It is also the thing that will surprise you fastest
as a rule author: if your `pattern` is written to match inside a string
argument (for example, targeting text *inside* a selector string like
`nth-child(`), the whole match can land wholly within that string literal
and get silently dropped. `LOC-002` works around exactly this by anchoring
its nth-child alternative to start at `.locator(` — outside the string — so
the match begins in real code and only runs into the literal, rather than
sitting wholly inside it. If a pattern rule you write mysteriously never
fires, check whether your match span is entirely inside quotes first.

Comment-only lines are blanked (not deleted — line numbers are preserved)
before matching, so a commented-out bad example doesn't count as a live
violation.

### `ast`

```ts
export interface AstDetector {
  kind: "ast";
  scope: FileScope;
  visit: (file: SourceFile) => RawHit[];
  countOpportunities: (file: SourceFile) => number;
}
```

A TypeScript-AST-based detector for anything a regex can't reliably express
— matching call structure, tracking whether a sibling call exists elsewhere
in the file, distinguishing an awaited expression from an unawaited one.

`src/core/detectors/ast.ts` provides the building blocks:

- **`visitWith(fn)`** — wraps a `(sourceFile, push) => void` walker into the
  `visit` shape. `fn` receives the parsed `ts.SourceFile` and a `push`
  callback; call `push(node)` for every violating node. Parsing happens
  inside the wrapper, so a parse failure throws — `analyze()` catches that
  and records the file as **skipped**, never silently dropped from the
  score.
- **`walk(node, fn)`** — a plain recursive AST walk.
- **`calleeText(node)`** — the textual callee of a call expression, e.g.
  `"test.describe.serial"` or `"expect"`.
- **`countTestCalls(file)`** — the most common `countOpportunities`
  implementation: counts `test(...)` / `it(...)` calls, so a rule is scored
  per-test rather than per-file. Returns `0` (not a throw) on a parse
  failure, matching `visitWith`'s skip behaviour rather than crashing the
  opportunity count.

Most `ast` rules in the Playwright pack are `visitWith(...)` for `visit` and
`countTestCalls` for `countOpportunities` — see `src/rules/playwright/isolation.ts`
and `assertion.ts` for worked examples ranging from a simple single-pass
walk (`ISO-002`) to state carried across the walk (`ISO-003`'s
setup-without-teardown tracking).

## The fixture pair (mandatory)

```ts
fixtures: { triggers: string; clean: string }
```

- **`triggers`** — a minimal snippet that MUST produce at least one finding
  for this rule.
- **`clean`** — a minimal snippet that MUST produce **zero** findings for
  this rule.

`src/rules/playwright/__tests__/fixtures.test.ts` runs every rule in every
pack against both halves of its own fixture pair and fails if either
assumption doesn't hold.

The `clean` half is the important half. **A rule without a passing "clean"
fixture is a rule with a known false positive, and will not be merged.**
False positives are the primary credibility risk for a tool whose entire
premise is "you can trust this critique" — a rule that has never been shown
NOT to fire on reasonable code is a rule nobody has actually checked. Write
`clean` as the idiomatic, correct version of whatever `triggers` gets wrong
— not a degenerate empty file — so the fixture test is actually exercising
the boundary the rule is trying to draw.

## Registering a rule

Add it to the relevant file under `src/rules/playwright/` (or a new file,
grouped by dimension) and export it from that file's array. Wire the array
into `src/rules/playwright/index.ts`'s `playwrightPack.rules` spread. There
is no separate registration step — `playwrightPack.rules` is the single
source of truth that `analyze()`, `qaiq_list_rules`, `qaiq_explain_rule`,
and this repository's README rule table (regenerated from it, not
hand-typed) all read from.
