/**
 * CSL-JSON — the one canonical citation model. Every citation, whether parsed
 * from the PDF or fetched from OpenAlex / Semantic Scholar, converges to this
 * shape (a pragmatic subset of the CSL 1.0.2 item schema).
 */
export interface CslName {
  family?: string;
  given?: string;
  literal?: string;
}

export interface CslDate {
  "date-parts": [number, ...number[]][];
}

export interface CslItem {
  id: string;
  type:
    | "article-journal"
    | "paper-conference"
    | "book"
    | "chapter"
    | "thesis"
    | "report"
    | "webpage"
    | "article";
  title?: string;
  author?: CslName[];
  issued?: CslDate;
  "container-title"?: string;
  volume?: string;
  page?: string;
  DOI?: string;
  URL?: string;
  abstract?: string;
  /** Non-standard extras (arXiv id, source record ids) live under custom. */
  custom?: {
    arxiv?: string;
    openalex?: string;
    semanticScholar?: string;
  };
}
