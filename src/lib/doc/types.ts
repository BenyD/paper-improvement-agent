import type { Failure } from "../failures";
import type { Section } from "../parse/types";

/**
 * The canonical parsed document. Phase 2 extends this with the citation graph
 * (in-text markers, CSL-JSON reference library, marker-entry bindings).
 */
export interface PaperDocument {
  id: string;
  meta: {
    filename: string;
    uploadedAt: string;
    pageCount: number;
    /** Layout observed by P1, e.g. "two-column" — context for the parse view. */
    layout: string;
  };
  title: string;
  abstract: string;
  sections: Section[];
  references: {
    heading: string;
    /** Raw reference-region lines; Phase 2 segments and parses these. */
    rawLines: string[];
    startPage: number;
  };
  failures: Failure[];
}
