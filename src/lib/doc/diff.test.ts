import { describe, expect, it } from "vitest";
import { wordDiff } from "./diff";

describe("wordDiff", () => {
  it("marks unchanged, added and removed words", () => {
    const d = wordDiff("the quick brown fox", "the slow brown fox jumps");
    expect(d).toEqual([
      { type: "same", text: "the" },
      { type: "del", text: "quick" },
      { type: "add", text: "slow" },
      { type: "same", text: "brown fox" },
      { type: "add", text: "jumps" },
    ]);
  });

  it("handles full replacement and identity", () => {
    expect(wordDiff("a b", "a b")).toEqual([{ type: "same", text: "a b" }]);
    expect(wordDiff("x", "y")).toEqual([
      { type: "del", text: "x" },
      { type: "add", text: "y" },
    ]);
  });
});
