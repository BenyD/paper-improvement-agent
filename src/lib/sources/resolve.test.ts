import { describe, expect, it } from "vitest";
import { reconstructAbstract } from "./openalex";
import { titleSimilarity } from "./resolve";

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
