import type { Failure } from "../failures";
import type { Line } from "../pdf/types";

export interface Section {
  id: string;
  /** Heading depth: 1 for "3 Method", 2 for "3.1 Setup", 0 for preamble text. */
  level: number;
  heading: string;
  paragraphs: string[];
}

/** P2 output: the paper's structure. */
export interface DocumentStructure {
  title: string;
  abstract: string;
  sections: Section[];
  failures: Failure[];
}

/** P3 output: the located reference-list region, still as raw lines. */
export interface ReferencesRegion {
  heading: string;
  lines: Line[];
  startPage: number;
  failures: Failure[];
}
