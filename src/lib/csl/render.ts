import { Cite } from "@citation-js/core";
import "@citation-js/plugin-csl";
import type { CslItem } from "./types";

export type CslTemplate = "apa" | "vancouver" | "harvard1";

/** Map our detected citation style to a bundled CSL template. */
export function templateForStyle(citationStyle: string): CslTemplate {
  // Numeric styles render closest to Vancouver; author-year to APA.
  return citationStyle === "author-year" ? "apa" : "vancouver";
}

/**
 * Format a bibliography through citeproc (citation-js + CSL styles) — the one
 * and only citation formatter in the app. `custom` is non-standard CSL and
 * confuses citeproc, so it is stripped for rendering only.
 */
export function renderBibliography(
  items: CslItem[],
  template: CslTemplate = "apa",
): string {
  const clean = items.map(({ custom: _custom, ...rest }) => rest);
  const cite = new Cite(clean);
  return cite.format("bibliography", {
    format: "text",
    template,
    lang: "en-US",
  });
}
