import { describe, expect, it } from "vitest";
import { sentenceAt, stripSupTokens } from "./context";

describe("sentenceAt", () => {
  const para =
    "Transformers changed NLP [1]. Earlier work relied on recurrence [2, 3]. Attention alone suffices for translation [1-3].";

  it("extracts the sentence containing a marker offset", () => {
    const offset = para.indexOf("[2, 3]");
    expect(sentenceAt(para, [offset, offset + 6])).toBe(
      "Earlier work relied on recurrence [2, 3].",
    );
  });

  it("handles the first and last sentences", () => {
    expect(
      sentenceAt(para, [para.indexOf("[1]"), para.indexOf("[1]") + 3]),
    ).toBe("Transformers changed NLP [1].");
    const last = para.indexOf("[1-3]");
    expect(sentenceAt(para, [last, last + 5])).toContain(
      "Attention alone suffices",
    );
  });

  it("does not split on abbreviation-like periods mid-sentence", () => {
    const text = "As shown by Smith et al. [4], the effect persists.";
    const offset = text.indexOf("[4]");
    expect(sentenceAt(text, [offset, offset + 3])).toBe(text);
  });
});

describe("stripSupTokens", () => {
  it("converts superscript tokens to bracket form for display/models", () => {
    expect(stripSupTokens("as shown⟦^2,3⟧ here")).toBe("as shown[2,3] here");
  });
});
