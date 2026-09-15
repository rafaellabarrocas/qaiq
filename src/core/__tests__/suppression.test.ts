import { describe, it, expect } from "vitest";
import {
  parseSuppressions, suppressionFindings, findApplicableSuppression, findWholeFileSuppression,
} from "../suppression.js";

const f = (content: string) => ({ path: "a.spec.ts", content });

describe("parseSuppressions", () => {
  // FIX 1a (final review wave): "vendor widget" (2 words, 13 chars) is
  // exactly the class of reason the substantive-reason bar now rejects — it
  // cleared the old "just non-empty" check while conveying nothing. Updated
  // to a reason that clears the new bar (>=15 chars AND >=3 words), which is
  // the fix under test, not a weakening of it.
  it("binds a suppression to the following line", () => {
    const m = parseSuppressions(f("// qaiq-disable-next-line WAIT-001 -- vendor widget has no ready signal\nawait x();"));
    expect(m.get(2)?.[0]).toMatchObject({ ruleId: "WAIT-001", reason: "vendor widget has no ready signal" });
  });

  it("records a missing reason as null", () => {
    const m = parseSuppressions(f("// qaiq-disable-next-line WAIT-001\nawait x();"));
    expect(m.get(2)?.[0]?.reason).toBeNull();
  });

  it("treats a whitespace-only reason as missing", () => {
    const m = parseSuppressions(f("// qaiq-disable-next-line WAIT-001 --   \nawait x();"));
    expect(m.get(2)?.[0]?.reason).toBeNull();
  });

  // FIX 1a (final review wave): a substantive reason must clear BOTH a
  // minimum length and a minimum word count. Below, "x" and "-- ." are
  // exactly the laundering pattern the review flagged — non-empty, but not
  // substantive — and must now be treated as no reason at all.
  it("treats a single-character reason ('x') as missing — not substantive", () => {
    const m = parseSuppressions(f("// qaiq-disable-next-line WAIT-001 -- x\nawait x();"));
    expect(m.get(2)?.[0]?.reason).toBeNull();
  });

  it("treats '-- .' as missing — not substantive", () => {
    const m = parseSuppressions(f("// qaiq-disable-next-line WAIT-001 -- .\nawait x();"));
    expect(m.get(2)?.[0]?.reason).toBeNull();
  });

  it("treats a long single word (no whitespace) as missing — fewer than 3 words", () => {
    const m = parseSuppressions(f("// qaiq-disable-next-line WAIT-001 -- xxxxxxxxxxxxxxxxxxxxx\nawait x();"));
    expect(m.get(2)?.[0]?.reason).toBeNull();
  });

  it("accepts a real, substantive reason", () => {
    const m = parseSuppressions(f("// qaiq-disable-next-line WAIT-001 -- third-party widget has no ready signal\nawait x();"));
    expect(m.get(2)?.[0]?.reason).toBe("third-party widget has no ready signal");
  });
});

describe("findApplicableSuppression", () => {
  it("does not apply a suppression with a missing reason", () => {
    const file = f("// qaiq-disable-next-line WAIT-001\nawait x();");
    expect(findApplicableSuppression(parseSuppressions(file), 2, "WAIT-001")).toBeUndefined();
  });

  it("does not apply a suppression with a non-substantive reason", () => {
    const file = f("// qaiq-disable-next-line WAIT-001 -- x\nawait x();");
    expect(findApplicableSuppression(parseSuppressions(file), 2, "WAIT-001")).toBeUndefined();
  });

  it("applies a suppression with a substantive reason", () => {
    const file = f("// qaiq-disable-next-line WAIT-001 -- third-party widget has no ready signal\nawait x();");
    expect(findApplicableSuppression(parseSuppressions(file), 2, "WAIT-001")).toMatchObject({
      ruleId: "WAIT-001", reason: "third-party widget has no ready signal",
    });
  });
});

describe("findWholeFileSuppression", () => {
  it("finds a reasoned suppression anywhere in the file's first 5 lines", () => {
    const file = f(
      "// header\n// qaiq-disable-next-line CI-001 -- third-party image has no faster mirror\nexport default defineConfig({});",
    );
    expect(findWholeFileSuppression(parseSuppressions(file), "CI-001")).toMatchObject({ ruleId: "CI-001" });
  });

  it("ignores an unreasoned suppression even inside the first 5 lines", () => {
    const file = f("// qaiq-disable-next-line CI-001\nexport default defineConfig({});");
    expect(findWholeFileSuppression(parseSuppressions(file), "CI-001")).toBeUndefined();
  });

  it("ignores a suppression comment beyond the first 5 lines", () => {
    const file = f(
      "1\n2\n3\n4\n5\n// qaiq-disable-next-line CI-001 -- third-party image has no faster mirror\nexport default defineConfig({});",
    );
    expect(findWholeFileSuppression(parseSuppressions(file), "CI-001")).toBeUndefined();
  });
});

describe("suppressionFindings", () => {
  it("flags an unreasoned suppression as SUP-001", () => {
    const file = f("// qaiq-disable-next-line WAIT-001\nawait x();");
    const findings = suppressionFindings(file, parseSuppressions(file));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ ruleId: "SUP-001", line: 1, severity: "warning" });
  });

  it("stays silent when a substantive reason is given", () => {
    const file = f("// qaiq-disable-next-line WAIT-001 -- vendor widget has no ready signal\nawait x();");
    expect(suppressionFindings(file, parseSuppressions(file))).toHaveLength(0);
  });
});
