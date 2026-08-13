/**
 * Failure is data, not an exception. Every pipeline stage returns the failures
 * it encountered alongside its output; the UI renders them, nothing drops them.
 */
export interface Failure {
  stage:
    | "extract"
    | "structure"
    | "locate-refs"
    | "segment"
    | "parse-entry"
    | "link-markers";
  code: string;
  message: string;
  /** Optional raw material for the UI (e.g. the text we could not parse). */
  context?: string;
}
