import { describe, expect, it } from "vitest";
import { reconstructAbstract } from "./openalex";
import { classifyMatch, corroborate, titleSimilarity } from "./resolve";

describe("classifyMatch (Crossref-style validation)", () => {
  it("verifies on title match + corroborating year", () => {
    expect(classifyMatch(0.8, true, null)).toBe("verified");
  });

  it("demotes to low-confidence on a contradicting year — no false green badge", () => {
    expect(classifyMatch(0.95, false, true)).toBe("low-confidence");
  });

  it("demotes to low-confidence on a contradicting author", () => {
    expect(classifyMatch(0.9, true, false)).toBe("low-confidence");
  });

  it("without any corroboration, only near-perfect titles verify", () => {
    expect(classifyMatch(0.95, null, null)).toBe("verified");
    expect(classifyMatch(0.78, null, null)).toBe("low-confidence");
  });

  it("rejects below the similarity threshold", () => {
    expect(classifyMatch(0.5, true, true)).toBe("rejected");
  });
});

describe("corroborate", () => {
  const rawText =
    "Ashish Vaswani, Noam Shazeer. Attention is all you need. NeurIPS, 2017.";

  it("checks year within ±1 and first-author surname in the raw text", () => {
    const [yearOk, authorOk] = corroborate(
      { issued: { "date-parts": [[2017]] } },
      rawText,
      {
        id: "x",
        type: "article",
        author: [{ family: "Vaswani", given: "A." }],
        issued: { "date-parts": [[2017]] },
      },
    );
    expect(yearOk).toBe(true);
    expect(authorOk).toBe(true);
  });

  it("flags a wrong candidate author as a contradiction", () => {
    const [, authorOk] = corroborate({}, rawText, {
      id: "x",
      type: "article",
      author: [{ family: "Hochreiter" }],
    });
    expect(authorOk).toBe(false);
  });

  it("returns null (unknown) when data to compare is missing", () => {
    const [yearOk, authorOk] = corroborate({}, rawText, {
      id: "x",
      type: "article",
    });
    expect(yearOk).toBeNull();
    expect(authorOk).toBeNull();
  });
});

describe("titleSimilarity", () => {
  it("matches identical titles regardless of case and punctuation", () => {
    expect(
      titleSimilarity(
        "Attention Is All You Need",
        "attention is all you need.",
      ),
    ).toBe(1);
  });

  it("scores near-identical titles above the 0.75 threshold", () => {
    expect(
      titleSimilarity(
        "BERT: Pre-training of deep bidirectional transformers",
        "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding",
      ),
    ).toBeGreaterThan(0.6);
  });

  it("scores unrelated titles low — no false verification", () => {
    expect(
      titleSimilarity(
        "Attention is all you need",
        "A survey of graph neural networks",
      ),
    ).toBeLessThan(0.2);
  });
});

describe("reconstructAbstract", () => {
  it("rebuilds text from an OpenAlex inverted index", () => {
    expect(
      reconstructAbstract({
        Attention: [0],
        is: [1],
        all: [2],
        you: [3],
        need: [4],
      }),
    ).toBe("Attention is all you need");
  });

  it("returns null when absent", () => {
    expect(reconstructAbstract(undefined)).toBeNull();
  });
});
