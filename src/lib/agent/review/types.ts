export type FindingKind = "missing-work" | "claim-mismatch";

export interface FindingSource {
  title: string;
  url: string;
  year?: number;
  authors?: string;
}

/** One reviewer-style finding, always grounded in a real, linkable source. */
export interface Finding {
  id: string;
  kind: FindingKind;
  severity: "high" | "medium" | "low";
  confidence: "high" | "medium" | "low";
  /** Where in the paper this applies. */
  sectionId?: string;
  markerId?: string;
  refId?: string;
  /** One-line reviewer summary. */
  summary: string;
  /** The full explanation, including where/why. */
  detail: string;
  /** The real work this finding is grounded in. */
  source: FindingSource;
}

export interface ReviewStats {
  sectionsScanned: number;
  queriesRun: number;
  candidatesConsidered: number;
  entriesChecked: number;
  claimsChecked: number;
  claimsSupported: number;
  skippedNoAbstract: number;
  /** High-severity accusations withdrawn by the adversarial verification pass. */
  mismatchesWithdrawn: number;
}

export interface ReviewResult {
  id: string;
  paperId: string;
  model: string;
  startedAt: string;
  finishedAt?: string;
  findings: Finding[];
  /** Honest process notes: what was skipped, what errored, what found nothing. */
  notes: string[];
  stats: ReviewStats;
  error?: string;
  /**
   * True while a run is in flight or was interrupted (refresh, crash).
   * A partial review is checkpointed to disk as findings arrive, so the next
   * run resumes from `completed` instead of re-spending tokens.
   */
  partial?: boolean;
  /** Work units already finished: section ids (missing-work) and entry ids
   *  (claim checks). Resume skips these. */
  completed?: { sections: string[]; entries: string[] };
}

export type ReviewEvent =
  | { type: "progress"; message: string }
  /** Low-level live narration (API waits, retries) under the progress line. */
  | { type: "activity"; message: string }
  | { type: "finding"; finding: Finding }
  | { type: "done"; result: ReviewResult }
  | { type: "error"; message: string };
