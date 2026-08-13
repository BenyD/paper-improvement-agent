import type { Failure } from "../failures";

/** One positioned text run from the PDF, in page coordinates (origin bottom-left). */
export interface TextSpan {
  text: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  fontName: string;
  page: number;
}

/** Spans merged into a visual line, ordered in reading order. */
export interface Line {
  text: string;
  x: number;
  y: number;
  page: number;
  /** Dominant font size on the line (weighted by text length). */
  fontSize: number;
  /** 0 for single-column pages / left column, 1 for right column. */
  column: number;
}

export interface PageInfo {
  width: number;
  height: number;
  columns: 1 | 2;
}

/** P1 output: reading-ordered lines with layout metadata. */
export interface PdfExtract {
  lines: Line[];
  pages: PageInfo[];
  failures: Failure[];
}
