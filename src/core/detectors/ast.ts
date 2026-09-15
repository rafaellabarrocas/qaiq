import ts from "typescript";
import type { SourceFile, RawHit } from "../types.js";

export function parse(file: SourceFile): ts.SourceFile {
  const sf = ts.createSourceFile(file.path, file.content, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const diags = (sf as unknown as { parseDiagnostics?: ts.Diagnostic[] }).parseDiagnostics ?? [];
  if (diags.length > 0) {
    throw new Error(`parse error: ${ts.flattenDiagnosticMessageText(diags[0]!.messageText, " ")}`);
  }
  return sf;
}

export function walk(node: ts.Node, fn: (n: ts.Node) => void): void {
  fn(node);
  node.forEachChild((c) => walk(c, fn));
}

export function lineOf(sf: ts.SourceFile, node: ts.Node): number {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

/** Text of a call's callee, e.g. "test.describe.serial" or "expect". */
export function calleeText(node: ts.CallExpression): string {
  return node.expression.getText();
}

export function countTestCalls(file: SourceFile): number {
  let n = 0;
  try {
    const sf = parse(file);
    walk(sf, (node) => {
      if (ts.isCallExpression(node) && /^(test|it)$/.test(calleeText(node))) n++;
    });
  } catch {
    return 0;
  }
  return Math.max(n, 0);
}

export function hit(sf: ts.SourceFile, node: ts.Node): RawHit {
  return { line: lineOf(sf, node), match: node.getText(sf).slice(0, 80) };
}

/**
 * Wraps a walk function into a Rule's `visit`. Shared by every AST-based
 * rule: parse() throws -> analyze() records a skipped file rather than
 * silently dropping it.
 */
export const visitWith = (fn: (sf: ts.SourceFile, push: (n: ts.Node) => void) => void) =>
  (file: SourceFile): RawHit[] => {
    const sf = parse(file);
    const hits: RawHit[] = [];
    fn(sf, (n) => hits.push(hit(sf, n)));
    return hits;
  };
