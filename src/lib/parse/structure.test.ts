import { describe, expect, it } from "vitest";
import type { Line } from "../pdf/types";
import { bodyFontSize, classifyHeading, detectStructure } from "./structure";

const line = (text: string, overrides: Partial<Line> = {}): Line => ({
  text,
  x: 72,
  y: 700,
  page: 1,
  fontSize: 10,
  column: 0,
  bold: false,
  spans: [],
  ...overrides,
});

describe("classifyHeading", () => {
  const body = 10;

  it("detects numbered top-level headings in a larger font", () => {
    expect(
      classifyHeading(line("3 Methodology", { fontSize: 12 }), body),
    ).toMatchObject({
      level: 1,
      text: "3 Methodology",
    });
  });

  it("derives level from dotted numbering", () => {
    expect(
      classifyHeading(line("3.1 Data Collection", { fontSize: 11 }), body)
        ?.level,
    ).toBe(2);
  });

  it("accepts known headings without numbering", () => {
    expect(
      classifyHeading(line("References", { fontSize: 12 }), body),
    ).toMatchObject({ level: 1 });
    expect(
      classifyHeading(line("ABSTRACT", { fontSize: 10 }), body),
    ).toMatchObject({ level: 1 });
  });

  it("rejects body text even when it starts with a number", () => {
    expect(
      classifyHeading(
        line(
          "3 of the 5 participants reported that the interface was hard to use.",
          {},
        ),
        body,
      ),
    ).toBeNull();
  });

  it("rejects long lines and lines ending like sentences", () => {
    expect(
      classifyHeading(
        line("A very long line ".repeat(8), { fontSize: 12 }),
        body,
      ),
    ).toBeNull();
    expect(
      classifyHeading(line("This looks big.", { fontSize: 12.5 }), body),
    ).toBeNull();
  });
});

describe("classifyHeading — bold-aware (font-name detection)", () => {
  const body = 10;

  it("accepts bold body-size unnumbered headings", () => {
    expect(
      classifyHeading(line("Ablation Studies", { bold: true }), body),
    ).toMatchObject({ kind: "styled" });
  });

  it("accepts bold numbered headings at body size", () => {
    expect(
      classifyHeading(line("4 Experiments", { bold: true }), body),
    ).toMatchObject({ level: 1, kind: "numbered" });
  });

  it("rejects figure/table captions even when bold", () => {
    expect(
      classifyHeading(
        line("Figure 2. Residual learning", { bold: true }),
        body,
      ),
    ).toBeNull();
    expect(
      classifyHeading(line("Table 1", { bold: true, fontSize: 12 }), body),
    ).toBeNull();
  });
});

describe("detectStructure — front-matter suppression", () => {
  it("keeps bold author/affiliation lines out of the section tree", () => {
    const lines: Line[] = [
      line("Deep Residual Learning", { fontSize: 18, y: 760 }),
      line("Kaiming He Xiangyu Zhang", { bold: true, y: 740 }),
      line("Microsoft Research", { bold: true, y: 726 }),
      line("Abstract", { fontSize: 12, y: 700 }),
      line("Deeper networks are hard to train and we ease that.", { y: 686 }),
      line("1. Introduction", { fontSize: 12, y: 650 }),
      line("Depth matters for visual recognition tasks today.", { y: 636 }),
      line("Ablation Studies", { bold: true, y: 600, page: 2 }),
      line("We ablate the residual connections carefully here.", {
        y: 586,
        page: 2,
      }),
    ];
    const result = detectStructure({
      lines,
      pages: [{ width: 612, height: 792, columns: 1 }],
      docMeta: { title: null, year: null },
      failures: [],
    });
    const headings = result.sections.map((x) => x.heading);
    expect(headings).not.toContain("Kaiming He Xiangyu Zhang");
    expect(headings).not.toContain("Microsoft Research");
    expect(headings).toContain("1. Introduction");
    // Bold headings beyond page 1 still count.
    expect(headings).toContain("Ablation Studies");
  });
});

describe("bodyFontSize", () => {
  it("returns the length-weighted dominant size, not the largest", () => {
    const lines = [
      line("Huge Title", { fontSize: 18 }),
      line("Lots of body text that should dominate the weighting completely", {
        fontSize: 10,
      }),
      line("More body text of the paper continuing at the regular size here", {
        fontSize: 10,
      }),
    ];
    expect(bodyFontSize(lines)).toBe(10);
  });
});

describe("detectStructure", () => {
  it("finds title, abstract and sections from a synthetic page", () => {
    const lines: Line[] = [
      line("A Study of Synthetic Papers", { fontSize: 18, y: 760 }),
      line("Jane Doe, University of Testing", { y: 740 }),
      line("Abstract", { fontSize: 12, y: 700 }),
      line("We study synthetic papers and find them useful for tests.", {
        y: 686,
      }),
      line("1 Introduction", { fontSize: 12, y: 650 }),
      line("Synthetic papers are documents generated for testing parsers.", {
        y: 636,
      }),
      line("They allow deterministic assertions about detection quality.", {
        y: 624,
      }),
    ];
    const result = detectStructure({
      lines,
      pages: [{ width: 612, height: 792, columns: 1 }],
      docMeta: { title: null, year: null },
      failures: [],
    });

    expect(result.title).toBe("A Study of Synthetic Papers");
    expect(result.abstract).toContain("synthetic papers");
    const intro = result.sections.find((s) => s.heading === "1 Introduction");
    expect(intro).toBeDefined();
    expect(intro?.paragraphs.join(" ")).toContain("deterministic assertions");
  });

  it("reports missing abstract as a failure instead of guessing", () => {
    const lines: Line[] = [
      line("Title Here", { fontSize: 16, y: 760 }),
      line("1 Introduction", { fontSize: 12, y: 700 }),
      line("Body text without any abstract present in the document.", {
        y: 686,
      }),
    ];
    const result = detectStructure({
      lines,
      pages: [{ width: 612, height: 792, columns: 1 }],
      docMeta: { title: null, year: null },
      failures: [],
    });
    expect(result.abstract).toBe("");
    expect(result.failures.some((f) => f.code === "no-abstract")).toBe(true);
  });
});
