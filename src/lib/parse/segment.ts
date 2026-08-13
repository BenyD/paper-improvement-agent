import type { Failure } from "../failures";
import type { Line } from "../pdf/types";

export type EntryStyle = "bracket" | "number-dot" | "hanging-indent";

export interface RawRefEntry {
  /** The list marker ("1", "17") for numbered styles; null for author-year. */
  marker: string | null;
  /** The entry's full text with line wraps joined and hyphenation repaired. */
  text: string;
}

export interface SegmentResult {
  style: EntryStyle | null;
  entries: RawRefEntry[];
  failures: Failure[];
}

const BRACKET_START = /^\[(\d{1,3})\]\s*/;
const DOT_START = /^(\d{1,3})\.\s+\S/;

/**
 * P4 — Segment the located reference region into entries.
 *
 * Algorithm:
 *  1. Detect the entry-start convention by counting line shapes:
 *     "[n]" markers → bracket; "n." markers → number-dot; otherwise fall back
 *     to hanging-indent geometry (entries start at the left margin, wrapped
 *     continuation lines are indented).
 *  2. Split at entry-start lines; join each group with hyphenation repair.
 *  3. Validate: numbered sequences should increase; gaps are surfaced as
 *     failures (a missed entry), never dropped. Entries that stay implausibly
 *     short are surfaced too.
 */
export function segmentReferences(lines: Line[]): SegmentResult {
  const failures: Failure[] = [];
  if (lines.length === 0) return { style: null, entries: [], failures };

  const bracketCount = lines.filter((l) => BRACKET_START.test(l.text)).length;
  const dotCount = lines.filter((l) => DOT_START.test(l.text)).length;

  let style: EntryStyle;
  if (bracketCount >= 3) style = "bracket";
  else if (dotCount >= 3) style = "number-dot";
  else style = "hanging-indent";

  const groups: { marker: string | null; lines: Line[] }[] = [];

  if (style === "bracket" || style === "number-dot") {
    const startRe = style === "bracket" ? BRACKET_START : DOT_START;
    for (const line of lines) {
      const m = line.text.match(startRe);
      if (m) {
        groups.push({
          marker: m[1],
          lines: [{ ...line, text: line.text.replace(startRe, "") }],
        });
      } else if (groups.length > 0) {
        groups.at(-1)?.lines.push(line);
      } else {
        failures.push({
          stage: "segment",
          code: "preamble-line",
          message:
            "Text before the first reference entry was ignored for segmentation.",
          context: line.text,
        });
      }
    }
    validateSequence(groups, failures);
  } else {
    // Hanging indent: entry starts return to the leftmost margin.
    const margin = Math.min(...lines.map((l) => l.x));
    for (const line of lines) {
      const isStart =
        line.x <= margin + 2 &&
        (groups.length === 0 || looksLikeEntryStart(line.text));
      if (isStart || groups.length === 0)
        groups.push({ marker: null, lines: [line] });
      else groups.at(-1)?.lines.push(line);
    }
  }

  const entries: RawRefEntry[] = [];
  for (const group of groups) {
    const text = joinWrapped(group.lines.map((l) => l.text));
    if (text.length < 20) {
      failures.push({
        stage: "segment",
        code: "entry-too-short",
        message: `A segmented entry is implausibly short and is likely noise or a split error.`,
        context: `${group.marker ? `[${group.marker}] ` : ""}${text}`,
      });
      continue;
    }
    entries.push({ marker: group.marker, text });
  }

  if (entries.length === 0) {
    failures.push({
      stage: "segment",
      code: "no-entries",
      message: "The reference region could not be segmented into entries.",
    });
    return { style: null, entries, failures };
  }

  return { style, entries, failures };
}

/** Author-name-like or year-bearing starts mark new hanging-indent entries. */
function looksLikeEntryStart(text: string): boolean {
  return /^[A-Z][\p{L}'’-]+,?\s/u.test(text);
}

function validateSequence(
  groups: { marker: string | null }[],
  failures: Failure[],
): void {
  for (let i = 1; i < groups.length; i++) {
    const prev = Number(groups[i - 1].marker);
    const cur = Number(groups[i].marker);
    if (Number.isFinite(prev) && Number.isFinite(cur) && cur !== prev + 1) {
      failures.push({
        stage: "segment",
        code: "sequence-gap",
        message: `Reference numbering jumps from ${prev} to ${cur}; entries in between may have been missed.`,
      });
    }
  }
}

function joinWrapped(lineTexts: string[]): string {
  let out = "";
  for (const text of lineTexts) {
    if (out.endsWith("-") && /^[a-z]/.test(text)) out = out.slice(0, -1) + text;
    else out += (out === "" ? "" : " ") + text;
  }
  return out.replace(/\s+/g, " ").trim();
}
