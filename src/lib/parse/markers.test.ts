import { describe, expect, it } from "vitest";
import { expandNumberList, linkMarkers, type RefForLinking } from "./markers";
import type { Section } from "./types";

const section = (id: string, paragraphs: string[]): Section => ({
  id,
  level: 1,
  heading: id,
  paragraphs,
});

const numberedRefs: RefForLinking[] = [1, 2, 3, 4, 5].map((n) => ({
  id: `ref-${n}`,
  marker: String(n),
  csl: { title: `Paper ${n}` },
  rawText: `Author ${n}. Paper ${n}. Venue, 200${n}.`,
}));

describe("expandNumberList", () => {
  it("expands lists and ranges", () => {
    expect(expandNumberList("1, 3-5")).toEqual([1, 3, 4, 5]);
    expect(expandNumberList("12")).toEqual([12]);
    expect(expandNumberList("2–4")).toEqual([2, 3, 4]); // en-dash
  });
});

describe("linkMarkers — numeric styles", () => {
  it("links bracket markers to entries and detects the style", () => {
    const result = linkMarkers(
      [
        section("intro", [
          "Transformers [1] build on attention [2, 3] and normalization [1-3].",
        ]),
      ],
      numberedRefs,
    );
    expect(result.style).toBe("numeric-bracket");
    expect(result.markers).toHaveLength(3);
    expect(result.markers[1].targets).toEqual(["ref-2", "ref-3"]);
    expect(result.markers[2].targets).toEqual(["ref-1", "ref-2", "ref-3"]);
  });

  it("links superscript tokens produced by extraction", () => {
    const result = linkMarkers(
      [section("intro", ["as shown previously⟦^2,3⟧ this holds."])],
      numberedRefs,
    );
    expect(result.style).toBe("superscript");
    expect(result.markers[0].targets).toEqual(["ref-2", "ref-3"]);
  });

  it("surfaces markers citing missing entries as unresolved + failure", () => {
    const result = linkMarkers([section("intro", ["see [7]."])], numberedRefs);
    expect(result.markers[0].targets).toEqual([]);
    expect(result.markers[0].unresolved).toEqual(["7"]);
    expect(result.failures.some((f) => f.code === "orphan-markers")).toBe(true);
  });

  it("reports never-cited references", () => {
    const result = linkMarkers(
      [section("intro", ["only [1] is cited."])],
      numberedRefs,
    );
    expect(result.failures.some((f) => f.code === "uncited-references")).toBe(
      true,
    );
  });
});

describe("linkMarkers — author-year", () => {
  const ayRefs: RefForLinking[] = [
    {
      id: "ref-vaswani",
      marker: null,
      csl: {
        author: [{ family: "Vaswani", given: "A." }],
        issued: { "date-parts": [[2017]] },
      },
      rawText: "Vaswani, A., et al. (2017). Attention is all you need.",
    },
    {
      id: "ref-devlin",
      marker: null,
      csl: {
        author: [{ family: "Devlin", given: "J." }],
        issued: { "date-parts": [[2019]] },
      },
      rawText: "Devlin, J., et al. (2019). BERT.",
    },
  ];

  it("links parenthetical and narrative citations by surname + year", () => {
    const result = linkMarkers(
      [
        section("intro", [
          "Attention dominates (Vaswani et al., 2017). Devlin et al. (2019) extended this.",
        ]),
      ],
      ayRefs,
    );
    expect(result.style).toBe("author-year");
    const targets = result.markers.flatMap((m) => m.targets);
    expect(targets).toContain("ref-vaswani");
    expect(targets).toContain("ref-devlin");
  });

  it("handles multi-cite groups split by semicolons", () => {
    const result = linkMarkers(
      [
        section("intro", [
          "Prior work (Vaswani et al., 2017; Devlin et al., 2019) shows.",
        ]),
      ],
      ayRefs,
    );
    expect(result.markers[0].targets).toEqual(["ref-vaswani", "ref-devlin"]);
  });

  it("ignores parentheticals that merely contain a number", () => {
    const result = linkMarkers(
      [section("intro", ["The dataset (collected 2019) grew."])],
      ayRefs,
    );
    expect(
      result.markers.filter((m) => m.targets.length + m.unresolved.length > 0),
    ).toHaveLength(0);
  });
});
