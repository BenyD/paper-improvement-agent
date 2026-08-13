import { describe, expect, it } from "vitest";
import type { Line, TextSpan } from "../pdf/types";
import { cellsOf, detectTableRuns, isMarkdownTable } from "./tables";

/** A line whose spans sit at the given x positions (10pt font). */
function rowLine(cells: [number, string][], y: number): Line {
  const spans: TextSpan[] = cells.map(([x, text]) => ({
    text,
    x,
    y,
    width: text.length * 5,
    fontSize: 10,
    fontName: "F1",
    bold: false,
    page: 1,
  }));
  return {
    text: cells.map(([, t]) => t).join(" "),
    x: spans[0].x,
    y,
    page: 1,
    fontSize: 10,
    column: 0,
    bold: false,
    spans,
  };
}

function proseLine(text: string, y: number): Line {
  // one long span: no internal gaps, so exactly one cell
  return rowLine([[72, text]], y);
}

describe("cellsOf", () => {
  it("splits at column gutters, not word spaces", () => {
    const line = rowLine(
      [
        [72, "base"],
        [150, "6"],
        [200, "512"],
      ],
      700,
    );
    expect(cellsOf(line).map((c) => c.text)).toEqual(["base", "6", "512"]);
  });

  it("yields one cell for prose", () => {
    expect(
      cellsOf(proseLine("An attention function maps a query.", 700)),
    ).toHaveLength(1);
  });
});

describe("detectTableRuns", () => {
  const table = [
    rowLine(
      [
        [72, "N"],
        [150, "dmodel"],
        [220, "dff"],
      ],
      700,
    ),
    rowLine(
      [
        [72, "base"],
        [150, "512"],
        [220, "2048"],
      ],
      688,
    ),
    rowLine(
      [
        [72, "big"],
        [150, "1024"],
        [220, "4096"],
      ],
      676,
    ),
    rowLine(
      [
        [72, "small"],
        [150, "256"],
        [220, "1024"],
      ],
      664,
    ),
  ];

  it("reconstructs aligned rows into a markdown table", () => {
    const runs = detectTableRuns(table);
    expect(runs).toHaveLength(1);
    expect(runs[0].markdown).toContain("| N | dmodel | dff |");
    expect(runs[0].markdown).toContain("| base | 512 | 2048 |");
    expect(isMarkdownTable(runs[0].markdown)).toBe(true);
  });

  it("leaves prose runs alone", () => {
    const lines = [
      proseLine("This paragraph is ordinary text without gaps.", 700),
      proseLine("It continues on a second wrapped line here.", 688),
      proseLine("And a third line to be safe about runs.", 676),
    ];
    expect(detectTableRuns(lines)).toHaveLength(0);
  });

  it("keeps table runs and surrounding prose separate", () => {
    const lines = [
      proseLine("Prose before the table appears here.", 712),
      ...table,
      proseLine("Prose after the table resumes here.", 652),
    ];
    const runs = detectTableRuns(lines);
    expect(runs).toHaveLength(1);
    expect(runs[0].start).toBe(1);
    expect(runs[0].end).toBe(5);
  });
});
