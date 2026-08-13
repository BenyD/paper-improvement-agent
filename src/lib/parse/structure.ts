import type { Failure } from "../failures";
import type { Line, PdfExtract } from "../pdf/types";
import { detectTableRuns } from "./tables";
import type { DocumentStructure, Section } from "./types";

/**
 * P2 — Structure. Reading-ordered lines → title, abstract, sections.
 *
 * Algorithm:
 *  1. Body font size = the extract's dominant font size (weighted by length).
 *  2. Title = the largest-font line cluster in the top half of page 1.
 *  3. Headings = lines that are (a) numbered like "3" / "3.1" / "IV." followed
 *     by short title-like text, or (b) short standalone lines in a font larger
 *     than body, or (c) well-known unnumbered headings (Abstract, References,
 *     Acknowledgments, ...).
 *  4. Abstract = text between the Abstract heading and the next heading.
 *  5. Sections = text between consecutive headings; paragraph breaks where the
 *     vertical gap between consecutive lines exceeds 1.6x the median line gap,
 *     or on column/page boundaries with indent.
 */
export function detectStructure(extract: PdfExtract): DocumentStructure {
  const failures: Failure[] = [];
  const { lines } = extract;

  if (lines.length === 0) {
    return { title: "", abstract: "", sections: [], failures };
  }

  const bodySize = bodyFontSize(lines);
  const title = detectTitle(lines, bodySize);
  if (title === "") {
    failures.push({
      stage: "structure",
      code: "no-title",
      message:
        "Could not identify a title on page 1 (no line cluster clearly larger than body text).",
    });
  }

  let headingIndices: {
    index: number;
    level: number;
    text: string;
    kind: HeadingKind;
  }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const h = classifyHeading(lines[i], bodySize);
    if (h) headingIndices.push({ index: i, ...h });
  }

  // Front-matter suppression: author names and affiliations in the title
  // block are often bold/larger, but they precede the first real anchor
  // (a numbered or known heading like Abstract/Introduction). Merely-styled
  // candidates on page 1 before that anchor are front matter, not structure.
  headingIndices = headingIndices.filter(
    (h) => !(h.kind === "styled" && lines[h.index].page === 1),
  );

  // The title lines classify as headings too (large font) — drop them.
  headingIndices = headingIndices.filter(
    (h) => !(lines[h.index].page === 1 && title.includes(h.text)),
  );

  // A heading text recurring 3+ times is figure/table furniture (e.g. repeated
  // chart labels), not structure — unless it is numbered or a known heading.
  const counts = new Map<string, number>();
  for (const h of headingIndices)
    counts.set(h.text, (counts.get(h.text) ?? 0) + 1);
  headingIndices = headingIndices.filter(
    (h) =>
      (counts.get(h.text) ?? 0) < 3 ||
      NUMBERED.test(h.text) ||
      KNOWN_HEADINGS.test(h.text),
  );

  if (headingIndices.length === 0) {
    failures.push({
      stage: "structure",
      code: "no-headings",
      message:
        "No section headings detected; the whole body is presented as a single section.",
    });
  }

  const sections: Section[] = [];
  let abstract = "";

  // Text before the first heading (after the title) is the preamble: authors,
  // affiliations. We keep it as its own pseudo-section so nothing is dropped.
  const firstHeading = headingIndices[0]?.index ?? lines.length;
  const preamble = paragraphsFrom(lines.slice(0, firstHeading), title);
  if (preamble.length > 0) {
    sections.push({
      id: "preamble",
      level: 0,
      heading: "(front matter)",
      paragraphs: preamble,
    });
  }

  for (let h = 0; h < headingIndices.length; h++) {
    const { index, level, text } = headingIndices[h];
    const end = headingIndices[h + 1]?.index ?? lines.length;
    const body = paragraphsFrom(lines.slice(index + 1, end), "");

    if (
      /^abstract\b/i.test(text) ||
      (text === "" && /^abstract\b/i.test(lines[index].text))
    ) {
      // First-page figures bleed chart data into the abstract region (axis
      // labels, benchmark numbers). Cut at the first debris paragraph: an
      // abstract is prose, and everything after the bleed starts is figure.
      const debrisAt = body.findIndex(isNumericDebris);
      const kept = debrisAt === -1 ? body : body.slice(0, debrisAt);
      if (debrisAt !== -1) {
        // Chart legends fragment into short paragraphs too small for the
        // debris ratio ("DeepSeek-V3 Qwen2.5 100", "90.2"). With debris
        // confirmed adjacent, pop trailing non-prose paragraphs, then cut
        // any glued numeric tail after the last sentence terminator.
        while (kept.length > 0) {
          const last = kept[kept.length - 1].trim();
          if (/[.!?]$/.test(last) && last.split(/\s+/).length >= 8) break;
          kept.pop();
        }
        const last = kept.at(-1);
        const m = last?.match(/^([\s\S]*[.!?])\s+([^.!?]+)$/);
        if (last && m) {
          const tail = m[2].split(/\s+/);
          const numeric = tail.filter((t) => /^[\d.,%]+$/.test(t)).length;
          if (tail.length >= 3 && numeric / tail.length >= 0.3) {
            kept[kept.length - 1] = m[1];
          }
        }
      }
      abstract = kept.join("\n\n");
      if (debrisAt !== -1) {
        failures.push({
          stage: "structure",
          code: "abstract-figure-bleed",
          message:
            "Figure data adjacent to the abstract was cut from it (chart labels/numbers are not prose).",
          context: body.slice(debrisAt).join(" ").slice(0, 160),
        });
      }
      continue;
    }
    sections.push({
      id: `s${h}`,
      level,
      heading: text || lines[index].text,
      paragraphs: body,
    });
  }

  if (abstract === "") {
    // Fallback: a paragraph in the preamble starting with "Abstract".
    const inPreamble = preamble.find((p) => /^abstract[.:\s—-]/i.test(p));
    if (inPreamble) {
      abstract = inPreamble.replace(/^abstract[.:\s—-]+/i, "");
    } else {
      failures.push({
        stage: "structure",
        code: "no-abstract",
        message:
          "No abstract found (neither an Abstract heading nor an abstract-led paragraph).",
      });
    }
  }

  return { title, abstract, sections, failures };
}

export function bodyFontSize(lines: Line[]): number {
  const weight = new Map<number, number>();
  for (const line of lines) {
    const size = Math.round(line.fontSize * 2) / 2;
    weight.set(size, (weight.get(size) ?? 0) + line.text.length);
  }
  let best = lines[0].fontSize;
  let bestWeight = -1;
  for (const [size, w] of weight) {
    if (w > bestWeight) {
      best = size;
      bestWeight = w;
    }
  }
  return best;
}

function detectTitle(lines: Line[], bodySize: number): string {
  const page1 = lines.filter((l) => l.page === 1);
  if (page1.length === 0) return "";
  const maxSize = Math.max(...page1.map((l) => l.fontSize));
  if (maxSize < bodySize * 1.15) return "";
  // Collect consecutive lines at (near) the max size — multi-line titles.
  const titleLines = page1.filter((l) => l.fontSize >= maxSize * 0.95);
  return titleLines
    .slice(0, 4)
    .map((l) => l.text)
    .join(" ")
    .trim();
}

const KNOWN_HEADINGS =
  /^(abstract|introduction|related work|background|methods?|methodology|experiments?|results|discussion|conclusions?|references|bibliography|acknowledgm?ents?|appendix|limitations)\b/i;

const NUMBERED = /^(\d+(\.\d+)*|[IVXLC]+)\.?\s+(.{2,80})$/;

export type HeadingKind = "numbered" | "known" | "styled";

const CAPTION = /^(figure|fig\.|table|algorithm|listing)\b/i;

export function classifyHeading(
  line: Line,
  bodySize: number,
): { level: number; text: string; kind: HeadingKind } | null {
  const text = line.text.trim();
  if (text.length === 0 || text.length > 90) return null;
  if (CAPTION.test(text)) return null; // captions are furniture, not structure
  const larger = line.fontSize >= bodySize * 1.05;

  // IEEE convention: Roman numeral, period, ALL-CAPS title at body size
  // ("I. INTRODUCTION"). The dot and caps-only title distinguish this from
  // figure text like "C T1", which the arabic-only rule below rejects.
  if (/^[IVXLC]{1,7}\.\s+[A-Z][A-Z\s,:&-]{2,70}$/.test(text)) {
    return { level: 1, text, kind: "numbered" };
  }

  const numbered = text.match(NUMBERED);
  // Years, DOI fragments and other large numbers are not section numbers:
  // "2018. URL ..." and "7.3476145. URL ..." are wrapped reference lines.
  // Real section numbers keep every dotted component small.
  if (
    numbered?.[1]
      .split(".")
      .some((part) => /^\d+$/.test(part) && Number(part) > 99)
  ) {
    return null;
  }
  if (numbered) {
    const num = numbered[1];
    const level = num.includes(".") ? num.split(".").length : 1;
    // Top-level numbers need a larger or bold font (body text often starts
    // with a number); dotted numbers followed by a title-case word are
    // heading-shaped on their own — many templates set subsections at body
    // size (bold only, which the font-name check now surfaces).
    const dottedTitle =
      num.includes(".") && /^[A-Z]/.test(numbered[3]) && text.length <= 70;
    // ICLR-style templates set headings in caps at body size ("1 INTRODUCTION").
    // Arabic numbers only: a lone "C" or "V" in figure text parses as a Roman
    // numeral and would turn diagram labels into headings.
    const allCaps =
      /^\d/.test(num) &&
      /[A-Z]{3}/.test(numbered[3]) &&
      numbered[3] === numbered[3].toUpperCase();
    if (larger || dottedTitle || allCaps || line.bold)
      return { level, text, kind: "numbered" };
  }

  if (
    KNOWN_HEADINGS.test(text) &&
    (larger || line.bold || text === text.toUpperCase())
  ) {
    return { level: 1, text, kind: "known" };
  }

  // Short standalone line that is clearly larger, or bold at body size —
  // unnumbered headings in either convention.
  if (
    text.length <= 60 &&
    !/[.;:,]$/.test(text) &&
    ((larger && line.fontSize >= bodySize * 1.15) ||
      (line.bold && line.fontSize >= bodySize * 0.95))
  ) {
    return { level: 1, text, kind: "styled" };
  }

  return null;
}

/** Chart/table fragments: mostly numbers and tiny tokens, not prose. */
function isNumericDebris(text: string): boolean {
  const tokens = text.split(/\s+/);
  if (tokens.length < 4) return false;
  const dataish = tokens.filter(
    (t) => /^[\d.,()%×±\-–|]+$/.test(t) || t.length <= 2,
  ).length;
  return dataish / tokens.length >= 0.6;
}

/**
 * Group consecutive lines into paragraphs using vertical gaps. Column and page
 * transitions are only breaks when the next line is indented.
 */
function paragraphsFrom(lines: Line[], excludeText: string): string[] {
  const kept = lines.filter(
    (l) => !excludeText.includes(l.text) || excludeText === "",
  );
  if (kept.length === 0) return [];

  // Reconstruct aligned-column table runs first (pdf-inspector-style); the
  // remaining segments go through ordinary gap-based paragraph grouping.
  const tableRuns = detectTableRuns(kept);
  if (tableRuns.length > 0) {
    const out: string[] = [];
    let cursor = 0;
    for (const run of tableRuns) {
      out.push(...gapParagraphs(kept.slice(cursor, run.start)));
      out.push(run.markdown);
      cursor = run.end;
    }
    out.push(...gapParagraphs(kept.slice(cursor)));
    return out.filter((x) => x.length > 0);
  }
  return gapParagraphs(kept);
}

function gapParagraphs(kept: Line[]): string[] {
  if (kept.length === 0) return [];

  const gaps: number[] = [];
  for (let i = 1; i < kept.length; i++) {
    const prev = kept[i - 1];
    const cur = kept[i];
    if (prev.page === cur.page && prev.column === cur.column)
      gaps.push(prev.y - cur.y);
  }
  gaps.sort((g1, g2) => g1 - g2);
  const median = gaps[Math.floor(gaps.length / 2)] || 12;

  const paragraphs: string[] = [];
  let current: string[] = [];
  for (let i = 0; i < kept.length; i++) {
    const line = kept[i];
    const prev = kept[i - 1];
    if (i > 0) {
      const sameFlow = prev.page === line.page && prev.column === line.column;
      const gap = sameFlow ? prev.y - line.y : 0;
      const indented = line.x > prev.x + 5;
      const isBreak = sameFlow
        ? gap > median * 1.6 || (indented && gap > median * 1.1)
        : indented;
      if (isBreak && current.length > 0) {
        paragraphs.push(dehyphenate(current));
        current = [];
      }
    }
    current.push(line.text);
  }
  if (current.length > 0) paragraphs.push(dehyphenate(current));
  return paragraphs.filter((p) => p.length > 0);
}

/** Join wrapped lines, repairing end-of-line hyphenation ("infor- mation"). */
function dehyphenate(lines: string[]): string {
  let out = "";
  for (const line of lines) {
    if (out.endsWith("-") && /^[a-z]/.test(line)) out = out.slice(0, -1) + line;
    else out += (out === "" ? "" : " ") + line;
  }
  return out.trim();
}
