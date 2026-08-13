import type { Line } from "../pdf/types";

/**
 * Alignment-based table reconstruction, ported from the approach in
 * Firecrawl's pdf-inspector (src/tables/detect_heuristic.rs + grid.rs),
 * adapted to our Line/TextSpan model:
 *
 *  1. Cells: split a line's spans wherever the horizontal gap exceeds a
 *     cell threshold (~0.7x font size — word spaces are ~0.25em, column
 *     gutters are much wider). Prose lines yield one cell; table rows yield
 *     several.
 *  2. Runs: 3+ consecutive multi-cell lines form a table candidate.
 *  3. Columns: cluster cell start-x positions across the run; a new column
 *     starts when x exceeds the running cluster center by a tolerance
 *     (their center-based clustering, fixed 18pt here).
 *  4. Grid: each line is a row; cells map to the nearest column; collisions
 *     join with a space. Runs failing validation (2+ columns, mostly filled)
 *     stay ordinary text.
 *
 * Output is a GitHub-style markdown table STRING, so the document model,
 * edit ops, invariants and export all keep working on plain paragraphs; the
 * UI recognizes the shape and renders a real table.
 */

interface Cell {
  text: string;
  x: number;
}

export function cellsOf(line: Line): Cell[] {
  const cells: Cell[] = [];
  const threshold = Math.max(6, line.fontSize * 0.7);
  for (let i = 0; i < line.spans.length; i++) {
    const span = line.spans[i];
    const prev = i > 0 ? line.spans[i - 1] : null;
    const gap = prev ? span.x - (prev.x + prev.width) : Infinity;
    if (cells.length === 0 || gap >= threshold) {
      cells.push({ text: span.text.trim(), x: span.x });
    } else {
      const last = cells[cells.length - 1];
      const space = gap > (prev?.fontSize ?? line.fontSize) * 0.15 ? " " : "";
      last.text += space + span.text.trim();
    }
  }
  return cells.filter((c) => c.text.length > 0);
}

const COLUMN_TOLERANCE = 18;
const MIN_ROWS = 3;

function clusterColumns(rows: Cell[][]): number[] {
  const xs = rows
    .flat()
    .map((c) => c.x)
    .sort((a, b) => a - b);
  const centers: number[] = [];
  let center = Number.NEGATIVE_INFINITY;
  let members = 0;
  for (const x of xs) {
    if (x - center > COLUMN_TOLERANCE) {
      centers.push(x);
      center = x;
      members = 1;
    } else {
      // running mean keeps the center representative of the column
      center = (center * members + x) / (members + 1);
      members++;
      centers[centers.length - 1] = center;
    }
  }
  return centers;
}

function columnIndex(centers: number[], x: number): number {
  let best = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  centers.forEach((c, i) => {
    const d = Math.abs(x - c);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  });
  return best;
}

export interface TableRun {
  /** Index range [start, end) into the input lines. */
  start: number;
  end: number;
  markdown: string;
}

/** Escape pipes so cell text cannot break the markdown table shape. */
const cellText = (t: string) => t.replace(/\|/g, "\\|");

export function detectTableRuns(lines: Line[]): TableRun[] {
  const runs: TableRun[] = [];
  let i = 0;
  while (i < lines.length) {
    if (cellsOf(lines[i]).length < 2) {
      i++;
      continue;
    }
    let j = i;
    const rows: Cell[][] = [];
    while (j < lines.length) {
      const cells = cellsOf(lines[j]);
      if (cells.length < 2) break;
      rows.push(cells);
      j++;
    }
    if (rows.length >= MIN_ROWS) {
      const centers = clusterColumns(rows);
      if (centers.length >= 2 && centers.length <= 24) {
        const grid = rows.map((cells) => {
          const row = new Array<string>(centers.length).fill("");
          for (const cell of cells) {
            const col = columnIndex(centers, cell.x);
            row[col] = row[col]
              ? `${row[col]} ${cellText(cell.text)}`
              : cellText(cell.text);
          }
          return row;
        });
        // Validation: most rows should occupy 2+ columns, or this is just
        // ragged prose that happened to split.
        const filled = grid.filter(
          (r) => r.filter((c) => c !== "").length >= 2,
        ).length;
        if (filled >= grid.length * 0.7) {
          const header = grid[0];
          const md = [
            `| ${header.join(" | ")} |`,
            `| ${header.map(() => "---").join(" | ")} |`,
            ...grid.slice(1).map((r) => `| ${r.join(" | ")} |`),
          ].join("\n");
          runs.push({ start: i, end: j, markdown: md });
        }
      }
    }
    i = Math.max(j, i + 1);
  }
  return runs;
}

/** True when a paragraph string is one of our reconstructed markdown tables. */
export function isMarkdownTable(paragraph: string): boolean {
  return /^\|.*\|\n\| ?---/.test(paragraph);
}
