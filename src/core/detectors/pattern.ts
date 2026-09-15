import ts from "typescript";
import type { PatternDetector, RawHit, SourceFile } from "../types.js";

// Blanks comment-ONLY lines while preserving line count, so a commented-out
// example of a bad pattern does not read as a live violation. Deliberately
// conservative: only a line whose trimmed content IS a comment gets blanked.
// A trailing "// ..." after real code is left alone — stripping mid-line
// would corrupt string literals containing "https://".
//
// NOTE on offsets: blanking replaces a comment line's content with "" (zero
// characters), NOT a same-length run of whitespace. Line COUNT is preserved
// (every "\n" survives), which is what keeps reported line numbers correct,
// but overall CHARACTER COUNT is NOT preserved once any comment line has
// been blanked — verified directly: stripCommentLines("const x=1;\n// a
// long comment\nconst y=2;\n") is 27 chars vs. 65 in the original. Absolute
// offsets taken from the stripped text therefore do NOT equal offsets into
// the original content past the first blanked line. The mapping helpers
// below convert stripped-content positions back to original-content
// positions via (line, column) re-basing rather than assuming equal length.
function stripCommentLines(content: string): string {
  return content
    .split("\n")
    .map((l) => {
      const t = l.trim();
      return t.startsWith("//") || t.startsWith("/*") || t.startsWith("* ") || t === "*" || t.startsWith("*/") ? "" : l;
    })
    .join("\n");
}

export interface Range {
  start: number;
  end: number;
}

/**
 * Absolute [start, end) offsets of every string/template literal token in
 * `content`, via the TypeScript scanner. This is a pure in-memory tokenizer
 * — importing `typescript` here is not filesystem access.
 *
 * Uses `scanner.getTokenStart()`, which is present on the installed
 * typescript@6.0.3 (confirmed directly: `getTokenStart` exists and returns
 * the same value `getTokenPos()` would). Falls back to `getTokenPos()` only
 * if `getTokenStart` is unavailable.
 *
 * If the scanner throws on malformed/unparseable input, returns an empty
 * range list — a file we cannot tokenize gets the old (pre-filter) behaviour
 * rather than failing the whole scan.
 */
export function stringLiteralRanges(content: string): Range[] {
  const ranges: Range[] = [];
  try {
    const scanner = ts.createScanner(ts.ScriptTarget.ES2022, false, ts.LanguageVariant.Standard, content);
    const LITERALS = new Set<ts.SyntaxKind>([
      ts.SyntaxKind.StringLiteral,
      ts.SyntaxKind.NoSubstitutionTemplateLiteral,
      ts.SyntaxKind.TemplateHead,
      ts.SyntaxKind.TemplateMiddle,
      ts.SyntaxKind.TemplateTail,
    ]);
    let token = scanner.scan();
    while (token !== ts.SyntaxKind.EndOfFileToken) {
      if (LITERALS.has(token)) {
        const start = typeof scanner.getTokenStart === "function" ? scanner.getTokenStart() : scanner.getTokenPos();
        ranges.push({ start, end: scanner.getTextPos() });
      }
      token = scanner.scan();
    }
  } catch {
    return [];
  }
  return ranges;
}

export function isInsideLiteral(ranges: Range[], start: number, end: number): boolean {
  return ranges.some((r) => start >= r.start && end <= r.end);
}

// Absolute offset (in `text`) where each line starts; index 0 = line 1.
function lineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") starts.push(i + 1);
  }
  return starts;
}

// Greatest 0-based line index whose start offset is <= pos.
function lineIndexAt(starts: number[], pos: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  let ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (starts[mid]! <= pos) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

/**
 * Maps a position in the comment-STRIPPED content to the equivalent absolute
 * position in the ORIGINAL content.
 *
 * stripCommentLines only ever blanks a whole line to "" — it never changes
 * line count and never touches a non-comment line — so the stripped text and
 * the original text are byte-identical on every line that was not blanked.
 * A position on such a line maps correctly by re-basing its column onto the
 * original line's start offset. This holds even if some *other* line in the
 * file was blanked (shifting later stripped-content offsets), because each
 * position is re-derived from its OWN line's original start, not carried
 * forward from a running stripped-content offset.
 */
function mapStrippedPosToOriginal(strippedStarts: number[], originalStarts: number[], pos: number): number {
  const li = lineIndexAt(strippedStarts, pos);
  const col = pos - strippedStarts[li]!;
  const origLineStart = originalStarts[li] ?? originalStarts[originalStarts.length - 1]!;
  return origLineStart + col;
}

// The literal-token filter is a TypeScript-scanner concept: it only makes
// sense for files the TS scanner can meaningfully tokenize. Running it over
// YAML (or any non-JS/TS file) misreads an ordinary quoted YAML scalar like
// `image: "mcr.microsoft.com/playwright"` as a TS string literal and drops
// the finding inside it.
function isScriptFile(path: string): boolean {
  return /\.(ts|tsx|js|jsx)$/.test(path);
}

export function runPattern(d: PatternDetector, file: SourceFile): RawHit[] {
  const hits: RawHit[] = [];
  const content = stripCommentLines(file.content);
  const literalRanges = isScriptFile(file.path) ? stringLiteralRanges(file.content) : [];
  const originalStarts = lineStarts(file.content);
  const strippedStarts = lineStarts(content);

  if (d.wholeFile) {
    // Absence checks and multi-line patterns cannot be evaluated line by line.
    const re = new RegExp(d.pattern.source, d.pattern.flags.replace("g", ""));
    const m = re.exec(content);
    if (m) {
      let line = content.slice(0, m.index).split("\n").length;
      // A `^`-anchored wholeFile pattern always matches at position 0 (that
      // is what `^` means), so `line` is always 1 regardless of where the
      // meaningful text actually sits — which makes the reported line, and
      // therefore any suppression aimed at it, arbitrary. Re-attribute to
      // the first line that has real content, so a disable comment placed
      // directly above the real target has somewhere sensible to land.
      if (line === 1 && d.pattern.source.startsWith("^")) {
        const contentLines = content.split("\n");
        const firstContentLine = contentLines.findIndex((l) => l.trim() !== "");
        if (firstContentLine >= 0) line = firstContentLine + 1;
      }
      const absStart = mapStrippedPosToOriginal(strippedStarts, originalStarts, m.index);
      const absEnd = mapStrippedPosToOriginal(strippedStarts, originalStarts, m.index + m[0].length);
      if (!isInsideLiteral(literalRanges, absStart, absEnd)) {
        hits.push({ line, match: m[0].split("\n")[0]!.slice(0, 80) });
      }
    }
    return hits;
  }

  content.split("\n").forEach((text, i) => {
    const re = new RegExp(d.pattern.source, d.pattern.flags.replace("g", ""));
    const m = re.exec(text);
    if (m) {
      // text is identical to the original line whenever a match is found on
      // it (a blanked comment line is "" and can never match), so the
      // original line's start offset plus the in-line match index is exact.
      const absStart = originalStarts[i]! + m.index;
      const absEnd = absStart + m[0].length;
      if (!isInsideLiteral(literalRanges, absStart, absEnd)) {
        hits.push({ line: i + 1, match: m[0] });
      }
    }
  });
  return hits;
}

export function countPatternOpportunities(d: PatternDetector, file: SourceFile): number {
  const stripped = stripCommentLines(file.content);
  const literalRanges = isScriptFile(file.path) ? stringLiteralRanges(file.content) : [];
  const originalStarts = lineStarts(file.content);
  const strippedStarts = lineStarts(stripped);
  const g = new RegExp(d.opportunity.source, d.opportunity.flags.includes("g") ? d.opportunity.flags : d.opportunity.flags + "g");

  let count = 0;
  let m: RegExpExecArray | null;
  while ((m = g.exec(stripped))) {
    const absStart = mapStrippedPosToOriginal(strippedStarts, originalStarts, m.index);
    const absEnd = mapStrippedPosToOriginal(strippedStarts, originalStarts, m.index + m[0].length);
    if (!isInsideLiteral(literalRanges, absStart, absEnd)) count++;
    if (m[0].length === 0) g.lastIndex++; // guard against zero-length match infinite loop
  }
  return count;
}
