import { describe, expect, it } from "vitest";
import { validateOps } from "./invariants";
import type { PaperDocument } from "./types";

/**
 * The non-negotiable, tested: no combination of edit operations may silently
 * drop a citation, orphan a marker, fabricate a source, or remove an entry.
 */

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
    title: "Test Paper",
    abstract: "An abstract.",
    sections: [
      {
        id: "intro",
        level: 1,
        heading: "1 Introduction",
        paragraphs: [
          "Transformers changed NLP [1]. They build on attention [2].",
          "Later work refined this [1, 2].",
        ],
      },
      {
        id: "method",
        level: 1,
        heading: "2 Method",
        paragraphs: ["We apply the method of [2]."],
      },
    ],
    citations: {
      entryStyle: "bracket",
      citationStyle: "numeric-bracket",
      entries: [1, 2].map((n) => ({
        id: `ref-${n}`,
        marker: String(n),
        rawText: `Author ${n}. Paper ${n}. Venue, 201${n}.`,
        csl: { id: `ref-${n}`, type: "article" as const, title: `Paper ${n}` },
        resolution: {
          status: "verified" as const,
          source: "openalex" as const,
          url: `https://openalex.org/W${n}`,
        },
      })),
      markers: [
        {
          id: "m0",
          sectionId: "intro",
          paragraph: 0,
          offset: [25, 28],
          raw: "[1]",
          targets: ["ref-1"],
          unresolved: [],
        },
        {
          id: "m1",
          sectionId: "intro",
          paragraph: 0,
          offset: [53, 56],
          raw: "[2]",
          targets: ["ref-2"],
          unresolved: [],
        },
        {
          id: "m2",
          sectionId: "intro",
          paragraph: 1,
          offset: [23, 29],
          raw: "[1, 2]",
          targets: ["ref-1", "ref-2"],
          unresolved: [],
        },
        {
          id: "m3",
          sectionId: "method",
          paragraph: 0,
          offset: [23, 26],
          raw: "[2]",
          targets: ["ref-2"],
          unresolved: [],
        },
      ],
    },
    references: { heading: "References", rawLines: [], startPage: 1 },
    failures: [],
  };
}

describe("validateOps — citation preservation (the non-negotiable)", () => {
  it("REJECTS an edit that drops a reference's last citation", () => {
    const doc = makeDoc();
    // Rewrite both intro paragraphs without [1]; ref-1 is cited nowhere else.
    const result = validateOps(doc, [
      {
        type: "replace_paragraph",
        sectionId: "intro",
        paragraph: 0,
        text: "Transformers changed NLP. They build on attention [2].",
      },
      {
        type: "replace_paragraph",
        sectionId: "intro",
        paragraph: 1,
        text: "Later work refined this [2].",
      },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.violations.join(" ")).toContain("ref-1");
  });

  it("ACCEPTS shortening that keeps every reference cited at least once", () => {
    const doc = makeDoc();
    const result = validateOps(doc, [
      {
        type: "replace_paragraph",
        sectionId: "intro",
        paragraph: 0,
        text: "Transformers changed NLP [1] via attention [2].",
      },
      { type: "delete_paragraph", sectionId: "intro", paragraph: 1 },
    ]);
    expect(result.ok).toBe(true);
  });

  it("ACCEPTS moving a citation between paragraphs within one op set", () => {
    const doc = makeDoc();
    const result = validateOps(doc, [
      {
        type: "replace_paragraph",
        sectionId: "intro",
        paragraph: 0,
        text: "Transformers changed NLP. They build on attention [2].",
      },
      {
        type: "replace_paragraph",
        sectionId: "method",
        paragraph: 0,
        text: "We apply the methods of [1] and [2].",
      },
    ]);
    expect(result.ok).toBe(true);
  });

  it("REJECTS deleting the only paragraph citing a reference", () => {
    const doc = makeDoc();
    const result = validateOps(doc, [
      {
        type: "replace_paragraph",
        sectionId: "intro",
        paragraph: 0,
        text: "Transformers changed NLP. They build on attention [2].",
      },
      { type: "delete_paragraph", sectionId: "intro", paragraph: 1 },
    ]);
    expect(result.ok).toBe(false); // [1] only lived in intro p0/p1
  });

  it("REJECTS text citing a nonexistent reference (fabrication)", () => {
    const doc = makeDoc();
    const result = validateOps(doc, [
      {
        type: "insert_paragraph",
        sectionId: "method",
        afterParagraph: 0,
        text: "Recent studies confirm this [9].",
      },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.violations.join(" ")).toContain("no reference entry");
  });

  it("REJECTS adding an unverified reference", () => {
    const doc = makeDoc();
    const result = validateOps(doc, [
      {
        type: "add_reference",
        csl: { id: "x", type: "article", title: "Made Up Paper" },
        resolution: { status: "unverified", note: "no match" },
      },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.violations.join(" ")).toContain("verified");
  });

  it("ACCEPTS adding a verified reference and citing it in new text", () => {
    const doc = makeDoc();
    const result = validateOps(doc, [
      {
        type: "add_reference",
        csl: {
          id: "x",
          type: "article",
          title: "Real Paper",
          issued: { "date-parts": [[2019]] },
        },
        resolution: {
          status: "verified",
          source: "openalex",
          url: "https://openalex.org/W3",
        },
      },
      {
        type: "insert_paragraph",
        sectionId: "method",
        afterParagraph: 0,
        text: "This aligns with recent findings [3].",
      },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.after.citations.entries).toHaveLength(3);
      const m = result.after.citations.markers.find((mk) => mk.raw === "[3]");
      expect(m?.targets).toEqual(["ref-3"]);
    }
  });

  it("REJECTS structural nonsense (bad section, out-of-range paragraph, conflicts)", () => {
    const doc = makeDoc();
    expect(
      validateOps(doc, [
        { type: "delete_paragraph", sectionId: "nope", paragraph: 0 },
      ]).ok,
    ).toBe(false);
    expect(
      validateOps(doc, [
        {
          type: "replace_paragraph",
          sectionId: "intro",
          paragraph: 7,
          text: "x",
        },
      ]).ok,
    ).toBe(false);
    expect(
      validateOps(doc, [
        {
          type: "replace_paragraph",
          sectionId: "intro",
          paragraph: 0,
          text: "a [1] [2]",
        },
        { type: "delete_paragraph", sectionId: "intro", paragraph: 0 },
      ]).ok,
    ).toBe(false);
  });
});

describe("validateOps — replace_abstract", () => {
  it("ACCEPTS a plain abstract rewrite and applies it", () => {
    const doc = makeDoc();
    const result = validateOps(doc, [
      { type: "replace_abstract", text: "A shorter abstract." },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.after.abstract).toBe("A shorter abstract.");
  });

  it("REJECTS emptying the abstract", () => {
    const doc = makeDoc();
    const result = validateOps(doc, [
      { type: "replace_abstract", text: "   " },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.violations.join(" ")).toMatch(/cannot be emptied/);
  });

  it("REJECTS introducing citation markers into the abstract", () => {
    const doc = makeDoc();
    const result = validateOps(doc, [
      { type: "replace_abstract", text: "Transformers changed NLP [1]." },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.violations.join(" ")).toMatch(/citation markers/);
  });

  it("REJECTS two conflicting abstract rewrites in one op set", () => {
    const doc = makeDoc();
    const result = validateOps(doc, [
      { type: "replace_abstract", text: "One version." },
      { type: "replace_abstract", text: "Another version." },
    ]);
    expect(result.ok).toBe(false);
  });
});
