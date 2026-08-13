import type { PaperDocument } from "@/lib/doc/types";

/** Strip P1's superscript tokens for text shown to models or users. */
export function stripSupTokens(text: string): string {
  return text.replace(/⟦\^([\d\s,;–-]+)⟧/g, "[$1]");
}

/** The sentence containing [start, end) — the claim a citation is attached to. */
export function sentenceAt(
  paragraph: string,
  offset: [number, number],
): string {
  const boundaries: number[] = [0];
  // Sentence enders followed by a capital/marker — but not abbreviation
  // periods ("et al.", "e.g.", "Fig.", single initials like "A.").
  const re =
    /(?<!\bet al)(?<!\be\.g)(?<!\bi\.e)(?<!\bFig)(?<!\bvs)(?<!\s[A-Z])[.!?](?=\s+[A-Z⟦[(]|\s*$)/g;
  for (const m of paragraph.matchAll(re)) boundaries.push((m.index ?? 0) + 1);
  boundaries.push(paragraph.length);

  let start = 0;
  let end = paragraph.length;
  for (let i = 0; i < boundaries.length - 1; i++) {
    if (boundaries[i] <= offset[0] && offset[0] < boundaries[i + 1]) {
      start = boundaries[i];
      end = boundaries[i + 1];
      break;
    }
  }
  return paragraph.slice(start, end).trim();
}

export interface SectionExcerpt {
  sectionId: string;
  heading: string;
  excerpt: string;
}

const SKIP_HEADINGS =
  /^(\(front matter\)|acknowledgm?ents?|references|bibliography|appendix|notation)/i;
const MAX_SECTIONS = 8;
const EXCERPT_CHARS = 1400;

/** The main body sections worth reviewing, with bounded excerpts. */
export function reviewableSections(doc: PaperDocument): SectionExcerpt[] {
  return doc.sections
    .filter(
      (s) =>
        s.level >= 1 &&
        s.level <= 2 &&
        s.paragraphs.length > 0 &&
        !SKIP_HEADINGS.test(s.heading),
    )
    .slice(0, MAX_SECTIONS)
    .map((s) => ({
      sectionId: s.id,
      heading: s.heading,
      excerpt: stripSupTokens(s.paragraphs.join("\n\n")).slice(
        0,
        EXCERPT_CHARS,
      ),
    }));
}
