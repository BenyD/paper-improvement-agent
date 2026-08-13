import { describe, expect, it } from "vitest";
import type { PaperDocument } from "../doc/types";
import {
  convertMarkers,
  escapeLatex,
  exportBibtex,
  exportLatex,
} from "./latex";

function makeDoc(): PaperDocument {
  return {
    id: "p1",
    meta: {
      filename: "t.pdf",
      uploadedAt: "",
      pageCount: 1,
      layout: "single-column",
      year: 2020,
    },
    title: "Testing 100% of Parsers & Friends",
    abstract: "We test parsers.",
    sections: [
      {
        id: "intro",
        level: 1,
        heading: "1 Introduction",
        paragraphs: ["Transformers changed NLP [1]. Ranges work too [1-2]."],
      },
      {
        id: "sub",
        level: 2,
        heading: "1.1 Setup",
        paragraphs: ["Costs under $5 & 10_units."],
      },
    ],
    citations: {
      entryStyle: "bracket",
      citationStyle: "numeric-bracket",
      entries: [1, 2].map((n) => ({
        id: `ref-${n}`,
        marker: String(n),
        rawText: `Author ${n}. Paper ${n}. Venue, 201${n}.`,
        csl: {
          id: `ref-${n}`,
          type: "article-journal" as const,
          title: `Paper ${n}`,
          author: [{ family: `Author${n}`, given: "A." }],
          issued: { "date-parts": [[2010 + n]] as [number][] },
        },
        resolution: {
          status: "verified" as const,
          url: `https://openalex.org/W${n}`,
        },
      })),
      markers: [],
    },
    references: { heading: "References", rawLines: [], startPage: 1 },
    failures: [],
  };
}

describe("escapeLatex", () => {
  it("escapes LaTeX specials", () => {
    expect(escapeLatex("100% of $5 & #1_a {b} ~x^2")).toBe(
      "100\\% of \\$5 \\& \\#1\\_a \\{b\\} \\textasciitilde{}x\\textasciicircum{}2",
    );
  });
});

describe("convertMarkers", () => {
  it("maps brackets, lists and ranges to \\cite keys", () => {
    const doc = makeDoc();
    expect(convertMarkers("see [1] and [1-2]", doc)).toBe(
      "see \\cite{ref-1} and \\cite{ref-1,ref-2}",
    );
  });

  it("leaves unknown markers untouched (never fabricates keys)", () => {
    expect(convertMarkers("see [9]", makeDoc())).toBe("see [9]");
  });
});

describe("exportLatex", () => {
  it("produces a compilable skeleton with sections, cites and a CSL bibliography", () => {
    const tex = exportLatex(makeDoc());
    expect(tex).toContain("\\documentclass{article}");
    expect(tex).toContain("\\section{Introduction}");
    expect(tex).toContain("\\subsection{Setup}");
    expect(tex).toContain("\\cite{ref-1}");
    expect(tex).toContain("\\begin{thebibliography}{2}");
    expect(tex).toContain("\\bibitem{ref-1}");
    expect(tex).toContain("Paper 1");
    expect(tex).toContain("\\end{document}");
  });
});

describe("exportBibtex", () => {
  it("emits well-formed entries with authors joined by 'and'", () => {
    const bib = exportBibtex(makeDoc());
    expect(bib).toContain("@article{ref-1,");
    expect(bib).toContain("author = {Author1, A.}");
    expect(bib).toContain("year = {2011}");
  });
});
