import type { Failure } from "../failures";
import type { Line, PdfExtract } from "../pdf/types";
import { classifyHeading } from "./structure";
import type { ReferencesRegion } from "./types";

const REF_HEADING =
  /^(references|bibliography|works cited|literature cited)\b/i;
const POST_REF_HEADING =
  /^(appendix|appendices|supplementary|acknowledgm?ents?)\b/i;

/**
 * P3 — Locate the reference list.
 *
 * Algorithm:
 *  1. Primary: find the last line matching a references heading (last, because
 *     a table of contents can mention "References" earlier).
 *  2. The region runs from there to the next post-reference heading
 *     (Appendix, ...) or the end of the document.
 *  3. Fallback when no heading matches: scan the final third of the document
 *     for the longest run of citation-shaped lines (starting with "[n]",
 *     "n.", or an author-year pattern) and use that run.
 */
export function locateReferences(
  extract: PdfExtract,
  bodySize: number,
): ReferencesRegion {
  const failures: Failure[] = [];
  const { lines } = extract;

  let start = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (
      REF_HEADING.test(lines[i].text.trim()) &&
      classifyHeading(lines[i], bodySize)
    ) {
      start = i;
      break;
    }
  }
  // Looser retry: heading match without the font-size requirement.
  if (start === -1) {
    for (let i = lines.length - 1; i >= 0; i--) {
      if (
        REF_HEADING.test(lines[i].text.trim()) &&
        lines[i].text.trim().length < 30
      ) {
        start = i;
        break;
      }
    }
  }

  if (start !== -1) {
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
      if (
        POST_REF_HEADING.test(lines[i].text.trim()) &&
        classifyHeading(lines[i], bodySize)
      ) {
        end = i;
        break;
      }
    }
    return {
      heading: lines[start].text.trim(),
      lines: lines.slice(start + 1, end),
      startPage: lines[start].page,
      failures,
    };
  }

  // Fallback: citation-density scan over the final third.
  const tailStart = Math.floor(lines.length * (2 / 3));
  const tail = lines.slice(tailStart);
  const run = longestCitationRun(tail);
  if (run.length >= 5) {
    failures.push({
      stage: "locate-refs",
      code: "no-heading-fallback",
      message: `No References heading found; using a citation-density scan (${run.length} citation-shaped lines near the end).`,
    });
    return {
      heading: "(inferred)",
      lines: run,
      startPage: run[0].page,
      failures,
    };
  }

  failures.push({
    stage: "locate-refs",
    code: "not-found",
    message:
      "No reference list could be located (no heading match and no citation-dense region).",
  });
  return { heading: "", lines: [], startPage: 0, failures };
}

const CITATION_SHAPED =
  /^(\[\d{1,3}\]|\d{1,3}\.\s|[A-Z][\p{L}'’-]+,?\s+([A-Z]\.\s*)+)/u;

function longestCitationRun(lines: Line[]): Line[] {
  let bestStart = 0;
  let bestLen = 0;
  let runStart = -1;
  let misses = 0;

  for (let i = 0; i < lines.length; i++) {
    if (CITATION_SHAPED.test(lines[i].text.trim())) {
      if (runStart === -1) runStart = i;
      misses = 0;
    } else if (runStart !== -1) {
      // Citation entries wrap across lines; tolerate continuation lines.
      misses++;
      if (misses > 3) {
        if (i - misses - runStart > bestLen) {
          bestStart = runStart;
          bestLen = i - misses - runStart;
        }
        runStart = -1;
        misses = 0;
      }
    }
  }
  if (runStart !== -1 && lines.length - runStart > bestLen) {
    bestStart = runStart;
    bestLen = lines.length - runStart;
  }
  return bestLen > 0 ? lines.slice(bestStart, bestStart + bestLen) : [];
}
