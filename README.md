# QAIQ

QAIQ scores the hygiene of a Playwright test suite — waits, locators,
isolation, assertions, CI config — and hands back findings and questions, not
a verdict.

## Quickstart

```
npx @rafaellabarrocas/qaiq .
```

Real output, from running QAIQ on its own repository:

```

  Hygiene Score  99/100

  Wait discipline     ██████████  100
  Locator quality     ··········  n/a
  Test isolation      ██████████   98
  Assertion strength  ██████████  100
  CI hygiene          ██████████  100

  FINDINGS (9)
   ~scripts/__tests__/check-ip-boundary.test.ts:78  ISO-004  Hardcoded identity data that collides in parallel
    src/core/__tests__/suppression.test.ts:25  SUP-001  Suppression without a reason
    src/core/__tests__/suppression.test.ts:34  SUP-001  Suppression without a reason
    src/core/__tests__/suppression.test.ts:39  SUP-001  Suppression without a reason
    src/core/__tests__/suppression.test.ts:44  SUP-001  Suppression without a reason
    src/core/__tests__/suppression.test.ts:61  SUP-001  Suppression without a reason
    src/io/__tests__/config.test.ts:7  ISO-001  Mutable module-level state shared across tests
    src/io/__tests__/discover.test.ts:8  ISO-001  Mutable module-level state shared across tests
    src/surfaces/mcp/__tests__/server.test.ts:15  ISO-001  Mutable module-level state shared across tests

  ~ = heuristic rule, weighted at half. Confirm before acting.

  NOT MEASURED — these need a human
   · Whether you tested the right things (risk coverage)
   · Whether your assertions match real intent (oracle correctness)
   · Whether the gaps that matter are covered (test design)
   · Whether this is safe to release (release judgment)

  Questions for a human
   ? QAIQ measures how tests are written, not what they cover. Who reviewed the test design against the product's real risks?

  QAIQ scores test-code hygiene only. A high score means your tests are well-written — not that your product is well-tested.
```

The five `SUP-001` findings are QAIQ correctly flagging its own test fixtures:
`src/core/__tests__/suppression.test.ts` deliberately embeds
`qaiq-disable-next-line` comments with missing or non-substantive reasons
(`-- x`, `-- .`, a 21-character run with no spaces) as literal fixture text,
to prove that FIX 1's substantive-reason bar rejects them. QAIQ's suppression
parser reads raw file text and has no notion of "this text is inside a JS
string literal argument," so it correctly reads these as real (and
correctly rejected) suppression attempts when scanning its own repository.

`Locator quality` reads `n/a`, not a perfect score, because QAIQ found zero
locator calls to judge in its own source tree — see [Scoring](#scoring) for
why a missing denominator is never rounded up to 100.

Other ways to run it:

```
npx @rafaellabarrocas/qaiq . --json                # machine-readable Scorecard
npx @rafaellabarrocas/qaiq . --min-score=80         # exit 1 if the headline score is below 80
```

Exit codes:

| Code | Meaning |
|---|---|
| `0` | Ran cleanly. (Findings can still exist — a clean run is not a clean score.) |
| `1` | `--min-score` (or `qaiq.config.json`'s `minScore`) was set and the headline score came in under it. |
| `2` | Operational failure — no test files found, unreadable config, a bad flag. Distinct from `1` on purpose: a broken run and a low score are different problems and should trip different CI behaviour. |

## What QAIQ does not do

QAIQ scores how your tests are *written*. It cannot tell you:

- Whether you tested the right things (risk coverage)
- Whether your assertions match real intent (oracle correctness)
- Whether the gaps that matter are covered (test design)
- Whether this is safe to release (release judgment)

Those are judgment calls. QAIQ is built to hand them to a person, not answer
them itself — which is why no output of this tool, CLI or MCP, ever returns
an approval, a pass, or a green light. There is no field named `ok`,
`approved`, `ready`, or `safe` anywhere in its schema, and there will not be
one added. Every scorecard also carries `openQuestions`, and that list is
never empty — even a suite that triggers zero findings still gets handed at
least one question only a person can answer. A high score means your tests
are well-written, not that your product is well-tested.

## The five dimensions

QAIQ scores a suite across five dimensions. Each is scored independently —
`null` ("n/a") when the suite offers zero opportunities to judge it, never
coerced to a number — and the headline score is the floor of the mean of
whichever dimensions actually had something to measure.

| Dimension | What it looks at |
|---|---|
| **Wait discipline** | Fixed sleeps, manual polling, brittle `networkidle` waits, hand-rolled retry loops — anything standing in for a real web-first assertion. |
| **Locator quality** | CSS/XPath/positional selectors, long literal-text matches, raw element handles — anything more coupled to DOM structure than to what a user perceives. |
| **Test isolation** | Shared mutable state, `describe.serial`, setup with no teardown, hardcoded identity data that collides under parallel workers. |
| **Assertion strength** | Tests with no assertion, tautological assertions, un-awaited retrying assertions. |
| **CI hygiene** | Missing failure evidence (trace/screenshot), retry counts high enough to mask flake, no parallelism, unpinned browser images. |

Findings are weighted by severity (`error` > `warning` > `info`) and
confidence (`high` vs. `heuristic`, at half weight) against the number of
opportunities QAIQ found for that dimension in your suite — so a suite with
ten waits and one bad one is not judged the same as a suite with one wait
that is bad.

## The 20 rules

Generated directly from `playwrightPack` (`src/rules/playwright/index.ts`) —
listed here so this table cannot drift from what the tool actually runs.

### wait-discipline
- `WAIT-001` — Hardcoded wait
- `WAIT-002` — Manual visibility polling
- `WAIT-003` — waitForLoadState('networkidle')
- `WAIT-004` — Redundant waitForLoadState('domcontentloaded')
- `WAIT-005` — Hand-rolled retry loop

### locator-quality
- `LOC-001` — CSS or XPath selector instead of a user-facing locator
- `LOC-002` — Positional selector
- `LOC-003` — Long literal text selector
- `LOC-004` — page.$ / page.$$ element handles

### test-isolation
- `ISO-001` — Mutable module-level state shared across tests
- `ISO-002` — Serial execution mode
- `ISO-003` — Setup hook with no matching teardown
- `ISO-004` — Hardcoded identity data that collides in parallel

### assertion-strength
- `ASR-001` — Test with no assertion
- `ASR-002` — Tautological assertion
- `ASR-004` — Missing await on a retrying assertion

### ci-hygiene
- `CI-001` — No trace or screenshot retained on failure
- `CI-002` — Retry count high enough to mask flake
- `CI-003` — No parallelism configured
- `CI-004` — Unpinned browser image in CI

Each rule also ships a `qaiq_explain_rule` entry (see [MCP](#mcp-setup))
with a rationale and a bad/good example — static, generic, and identical for
every caller.

## Suppressions

A finding can be suppressed line by line:

```ts
// qaiq-disable-next-line WAIT-001 -- flaky third-party widget has no better hook yet
await page.waitForTimeout(2000);
```

The text after `--` is mandatory, and it must be substantive: at least 15
characters **and** at least 3 whitespace-separated words. A reason that is
missing, or present but not substantive (`-- x`, `-- .`, a single long word
with no spaces), is treated as no reason at all: the suppression does not
apply — the underlying rule still reports — and it is itself flagged as
`SUP-001`, "Suppression without a reason." A suppression records a
deliberate human decision, and a non-substantive reason gives a false sense
that one was made; without a real one, nobody can tell later whether it is
still valid. This is the one place in QAIQ where an agent cannot silence a
finding by pattern-matching a comment: it has to write down why, and write
down enough that a person plausibly thought about it.

Every suppression that actually applied is recorded, not hidden: it appears
in the scorecard's `suppressed` array, and the CLI prints a `SUPPRESSED (n)`
block naming each `path:line`, rule, and reason whenever `n > 0`. A score
reached with suppressions in play is never indistinguishable from a
genuinely clean run.

## Configuration

An optional `qaiq.config.json` at the scanned root:

```json
{
  "exclude": ["node_modules", "dist", "build", ".git", "coverage"],
  "minScore": 80
}
```

Both fields are optional; the values above are the defaults. `--min-score`
on the command line overrides `minScore` from the file.

## MCP setup

QAIQ also ships an MCP server exposing four tools, all critique-only:

| Tool | What it returns |
|---|---|
| `qaiq_scan` | A full scorecard for a repository path. |
| `qaiq_review_snippet` | Findings for a pasted code snippet. |
| `qaiq_explain_rule` | A rule's rationale and examples, by id. |
| `qaiq_list_rules` | The rule list, optionally filtered by dimension. |

Every one of them returns `openQuestions`, `notMeasured`, and `disclaimer` —
none of them returns anything an agent could read as permission to proceed.
`qaiq_scan` and `qaiq_review_snippet` also return `findings` and
`suppressed` — every suppression that actually silenced a finding, so an
agent cannot read an empty or high-scoring result as "genuinely clean"
without also seeing what was suppressed to get there. None of them rewrites
your code: `qaiq_review_snippet` critiques the snippet you send, it does not
send one back.

Point an MCP-capable client at the server:

```json
{
  "mcpServers": {
    "qaiq": {
      "command": "npx",
      "args": ["-p", "@rafaellabarrocas/qaiq", "qaiq-mcp"]
    }
  }
}
```

The `-p @rafaellabarrocas/qaiq` is required: `qaiq-mcp` is a secondary bin of the `qaiq`
package, not a package name in its own right, so `npx` needs to be told
which package to fetch it from.

## Writing a rule

See [`docs/writing-rules.md`](docs/writing-rules.md) for the `Rule`
interface field by field, both detector kinds, and the fixture pair every
rule must ship with. In short: a rule without a passing "clean" fixture is a
rule with a known false positive, and will not be merged.

## Licence

Apache-2.0. See [`LICENSE`](LICENSE). Forks and redistributions must carry
[`NOTICE`](NOTICE) — that is a term of the licence, not a request.
