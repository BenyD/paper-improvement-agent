import { describe, expect, it } from "vitest";

// The grouping internals are exercised through extractPdf on real PDFs (see
// docs/SYSTEM_DESIGN.md); these tests cover the pure text helpers.

describe("text normalization (NFKC)", () => {
  it("folds ligature glyphs so API title matching works", () => {
    expect("classiﬁcation".normalize("NFKC")).toBe("classification");
    expect("eﬀicient".normalize("NFKC")).toBe("efficient");
  });
});
