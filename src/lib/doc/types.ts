import type { CslItem } from "../csl/types";
import type { Failure } from "../failures";
import type { CitationStyle, InTextMarker } from "../parse/markers";
import type { EntryStyle } from "../parse/segment";
import type { Section } from "../parse/types";
import type { Resolution } from "../sources/resolve";

/** One reference-list entry: raw text + CSL + how (whether) it was verified. */
export interface ReferenceEntry {
  id: string;
  /** List marker ("1", "17") for numbered styles; null for author-year. */
  marker: string | null;
  rawText: string;
  csl: CslItem;
  resolution: Resolution;
}

/**
 * The canonical parsed document — the single source of truth every later
 * stage (review, editing, export) operates on.
 */
export interface PaperDocument {
  id: string;
  meta: {
    filename: string;
    uploadedAt: string;
    pageCount: number;
    /** Layout observed by P1, e.g. "two-column" — context for the parse view. */
    layout: string;
    /** Publication year (newest reference year, PDF metadata as tiebreak). */
    year: number | null;
  };
  title: string;
  abstract: string;
  sections: Section[];
  citations: {
    /** How entries are listed ("bracket", "hanging-indent", ...). */
    entryStyle: EntryStyle | null;
    /** How the text cites ("numeric-bracket", "author-year", ...). */
    citationStyle: CitationStyle;
    entries: ReferenceEntry[];
    markers: InTextMarker[];
  };
  references: {
    heading: string;
    /** Raw reference-region lines, kept for display and debugging. */
    rawLines: string[];
    startPage: number;
  };
  failures: Failure[];
}
