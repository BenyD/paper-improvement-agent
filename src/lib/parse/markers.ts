import type { CslItem } from "../csl/types";
import type { Failure } from "../failures";
import type { Section } from "./types";

export type CitationStyle =
  | "numeric-bracket"
  | "superscript"
  | "author-year"
  | "unknown";

export interface InTextMarker {
  id: string;
  sectionId: string;
  paragraph: number;
  /** [start, end) character offsets of the marker within the paragraph. */
  offset: [number, number];
  raw: string;
  /** Reference entry ids this marker cites. */
  targets: string[];
  /** Cited numbers/names that match no reference entry (surfaced, not dropped). */
  unresolved: string[];
}

export interface MarkerResult {
  style: CitationStyle;
  markers: InTextMarker[];
  failures: Failure[];
}

export interface RefForLinking {
  id: string;
  marker: string | null;
  csl: Partial<CslItem>;
  rawText: string;
}

const BRACKET_RE = /\[(\d{1,3}(?:\s*[,–-]\s*\d{1,3})*)\]/g;
const SUP_RE = /⟦\^([\d\s,;–-]+)⟧/g;
// (Smith, 2020) / (Smith et al., 2020; Jones and Lee, 2019) / (Smith 2020)
const PAREN_AY_RE = /\(([^()]{2,120}?(?:19|20)\d{2}[a-z]?(?:[^()]{0,80})?)\)/g;
// Narrative: Smith et al. (2020), Smith and Jones (2019)
const NARRATIVE_AY_RE =
  /\b([A-Z][\p{L}'’-]+)(?:\s+et al\.?|\s+and\s+[A-Z][\p{L}'’-]+)?\s+\(((?:19|20)\d{2}[a-z]?)\)/gu;

/**
 * P6 — Detect the paper's citation style and link in-text markers to entries.
 *
 * Style detection counts each pattern's occurrences across the body; the
 * dominant one wins (a paper can technically mix, so the minority patterns are
 * still extracted, but the style label drives CSL formatting later).
 * Numeric markers link by list index; author-year markers link by first-author
 * surname + year against the entry's parsed fields with raw-text fallback.
 * Anything that links to nothing is kept as `unresolved` and surfaced.
 */
export function linkMarkers(
  sections: Section[],
  refs: RefForLinking[],
): MarkerResult {
  const failures: Failure[] = [];
  const markers: InTextMarker[] = [];

  let bracketHits = 0;
  let supHits = 0;
  let ayHits = 0;

  const byMarker = new Map<string, RefForLinking>();
  for (const ref of refs) if (ref.marker) byMarker.set(ref.marker, ref);

  let seq = 0;
  for (const section of sections) {
    section.paragraphs.forEach((para, pIdx) => {
      for (const m of para.matchAll(BRACKET_RE)) {
        bracketHits++;
        markers.push(
          numericMarker(`m${seq++}`, section.id, pIdx, m, m[1], byMarker),
        );
      }
      for (const m of para.matchAll(SUP_RE)) {
        supHits++;
        markers.push(
          numericMarker(`m${seq++}`, section.id, pIdx, m, m[1], byMarker),
        );
      }
      for (const m of para.matchAll(PAREN_AY_RE)) {
        const marker = authorYearMarker(`m${seq++}`, section.id, pIdx, m, refs);
        if (marker) {
          ayHits++;
          markers.push(marker);
        } else {
          seq--; // not a citation (e.g. "(see Section 2014)") — don't burn an id
        }
      }
      for (const m of para.matchAll(NARRATIVE_AY_RE)) {
        const marker = narrativeMarker(`m${seq++}`, section.id, pIdx, m, refs);
        if (marker) {
          ayHits++;
          markers.push(marker);
        } else {
          seq--;
        }
      }
    });
  }

  let style: CitationStyle = "unknown";
  const max = Math.max(bracketHits, supHits, ayHits);
  if (max > 0) {
    style =
      bracketHits === max
        ? "numeric-bracket"
        : supHits === max
          ? "superscript"
          : "author-year";
  }

  // In a non-superscript paper, superscript tokens that link to nothing are
  // footnote marks, not failed citations — drop them rather than crying orphan.
  if (style !== "superscript") {
    const drop = new Set(
      markers
        .filter((m) => m.raw.startsWith("⟦^") && m.targets.length === 0)
        .map((m) => m.id),
    );
    if (drop.size > 0) {
      for (let i = markers.length - 1; i >= 0; i--)
        if (drop.has(markers[i].id)) markers.splice(i, 1);
    }
  }

  if (max === 0 && refs.length > 0) {
    failures.push({
      stage: "link-markers",
      code: "no-markers",
      message:
        "No in-text citation markers were found, although the paper has a reference list.",
    });
  }

  const orphanCount = markers.filter((m) => m.unresolved.length > 0).length;
  if (orphanCount > 0) {
    failures.push({
      stage: "link-markers",
      code: "orphan-markers",
      message: `${orphanCount} in-text marker(s) cite entries that could not be found in the reference list.`,
    });
  }

  const citedIds = new Set(markers.flatMap((m) => m.targets));
  const uncited = refs.filter((r) => !citedIds.has(r.id));
  if (uncited.length > 0 && markers.length > 0) {
    failures.push({
      stage: "link-markers",
      code: "uncited-references",
      message: `${uncited.length} reference entr${uncited.length === 1 ? "y is" : "ies are"} never cited in the text.`,
      context: uncited
        .slice(0, 5)
        .map((r) => r.marker ?? r.csl.title ?? r.rawText.slice(0, 60))
        .join(" | "),
    });
  }

  return { style, markers, failures };
}

function numericMarker(
  id: string,
  sectionId: string,
  paragraph: number,
  m: RegExpMatchArray,
  list: string,
  byMarker: Map<string, RefForLinking>,
): InTextMarker {
  const numbers = expandNumberList(list);
  const targets: string[] = [];
  const unresolved: string[] = [];
  for (const n of numbers) {
    const ref = byMarker.get(String(n));
    if (ref) targets.push(ref.id);
    else unresolved.push(String(n));
  }
  return {
    id,
    sectionId,
    paragraph,
    offset: [m.index ?? 0, (m.index ?? 0) + m[0].length],
    raw: m[0],
    targets,
    unresolved,
  };
}

/** "1, 3-5" → [1, 3, 4, 5]; tolerant of en-dashes and spacing. */
export function expandNumberList(list: string): number[] {
  const out: number[] = [];
  for (const part of list.split(/[,;]/)) {
    const range = part.split(/[–-]/).map((s) => Number(s.trim()));
    if (
      range.length === 2 &&
      Number.isFinite(range[0]) &&
      Number.isFinite(range[1]) &&
      range[1] > range[0]
    ) {
      for (let n = range[0]; n <= range[1] && n - range[0] < 100; n++)
        out.push(n);
    } else if (Number.isFinite(range[0])) {
      out.push(range[0]);
    }
  }
  return out;
}

function authorYearMarker(
  id: string,
  sectionId: string,
  paragraph: number,
  m: RegExpMatchArray,
  refs: RefForLinking[],
): InTextMarker | null {
  const inner = m[1];
  // Split multi-cite groups: (Smith, 2020; Jones, 2019)
  const cites = inner.split(";").map((c) => c.trim());
  const targets: string[] = [];
  const unresolved: string[] = [];
  let anyLooksLikeCite = false;

  for (const cite of cites) {
    const year = cite.match(/(?:19|20)\d{2}[a-z]?/)?.[0];
    const surname = cite.match(/^[A-Z][\p{L}'’-]+/u)?.[0];
    if (!year || !surname) continue;
    anyLooksLikeCite = true;
    const ref = findByAuthorYear(refs, surname, year);
    if (ref) targets.push(ref.id);
    else unresolved.push(cite);
  }

  if (!anyLooksLikeCite) return null;
  return {
    id,
    sectionId,
    paragraph,
    offset: [m.index ?? 0, (m.index ?? 0) + m[0].length],
    raw: m[0],
    targets,
    unresolved,
  };
}

function narrativeMarker(
  id: string,
  sectionId: string,
  paragraph: number,
  m: RegExpMatchArray,
  refs: RefForLinking[],
): InTextMarker | null {
  const surname = m[1];
  const year = m[2];
  const ref = findByAuthorYear(refs, surname, year);
  return {
    id,
    sectionId,
    paragraph,
    offset: [m.index ?? 0, (m.index ?? 0) + m[0].length],
    raw: m[0],
    targets: ref ? [ref.id] : [],
    unresolved: ref ? [] : [`${surname} (${year})`],
  };
}

function findByAuthorYear(
  refs: RefForLinking[],
  surname: string,
  year: string,
): RefForLinking | null {
  const yearNum = Number(year.replace(/[a-z]$/, ""));
  const lower = surname.toLowerCase();
  for (const ref of refs) {
    const refYear = ref.csl.issued?.["date-parts"]?.[0]?.[0];
    if (refYear !== yearNum) continue;
    const inAuthors = (ref.csl.author ?? []).some(
      (a) =>
        a.family?.toLowerCase() === lower ||
        a.literal?.toLowerCase().includes(lower),
    );
    if (inAuthors || ref.rawText.slice(0, 120).toLowerCase().includes(lower))
      return ref;
  }
  return null;
}
