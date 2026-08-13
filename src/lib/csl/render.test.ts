import { describe, expect, it } from "vitest";
import { renderBibliography, templateForStyle } from "./render";
import type { CslItem } from "./types";

/**
 * Round-trip proof: the CslItems our pipeline produces satisfy the CSL
 * contract that citeproc (citation-js) actually enforces — so Phase 4/5
 * citation insertion and bibliography rebuilding can rely on the model.
 */
const items: CslItem[] = [
  {
    id: "ref-1",
    type: "paper-conference",
    title: "Attention Is All You Need",
    author: [
      { family: "Vaswani", given: "Ashish" },
      { family: "Shazeer", given: "Noam" },
    ],
    issued: { "date-parts": [[2017]] },
    "container-title": "Advances in Neural Information Processing Systems",
    URL: "https://openalex.org/W2626778328",
    custom: { openalex: "https://openalex.org/W2626778328" },
  },
  {
    id: "ref-2",
    type: "article-journal",
    title: "Layer Normalization",
    author: [
      { family: "Ba", given: "Jimmy Lei" },
      { literal: "The Deep Learning Group" },
    ],
    issued: { "date-parts": [[2016]] },
    DOI: "10.48550/arXiv.1607.06450",
    custom: { arxiv: "1607.06450" },
  },
];

describe("renderBibliography (citeproc round-trip)", () => {
  it("formats APA with authors, year and title", () => {
    const out = renderBibliography(items, "apa");
    expect(out).toContain("Vaswani");
    expect(out).toContain("(2017)");
    expect(out).toContain("Attention Is All You Need");
    expect(out).toContain("Ba");
  });

  it("formats Vancouver (numeric) too", () => {
    const out = renderBibliography(items, "vancouver");
    expect(out).toContain("Vaswani");
    expect(out).toContain("2017");
  });

  it("maps detected citation styles to templates", () => {
    expect(templateForStyle("author-year")).toBe("apa");
    expect(templateForStyle("numeric-bracket")).toBe("vancouver");
    expect(templateForStyle("superscript")).toBe("vancouver");
  });
});
