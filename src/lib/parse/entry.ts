import type { CslItem, CslName } from "../csl/types";

export interface EntryFields {
  /** Best-effort CSL built from the raw text alone (before API resolution). */
  csl: Partial<CslItem>;
  /** The segment most likely to be the title — the API search query. */
  titleGuess: string | null;
}

const DOI_RE = /\b10\.\d{4,9}\/[^\s"<>;,]+/i;
// "arXiv:1607.06450" and the pre-2017 CoRR style "abs/1409.0473".
const ARXIV_RE = /(?:arxiv[:\s]*|abs\/)(\d{4}\.\d{4,5})(v\d+)?/i;
const YEAR_RE = /\b(19|20)\d{2}\b/g;

/**
 * P5a — Local field extraction from one reference entry's text.
 *
 * Deterministic identifiers first (DOI, arXiv id, year), then a structural
 * title guess: reference entries across styles are period-separated segments
 * (authors . title . venue/publisher , year), so the title is typically the
 * first long segment after the author block that isn't identifier noise.
 * This stays a *guess* — resolution against OpenAlex/Semantic Scholar is what
 * verifies it (P5b), and unresolved entries are flagged, never trusted.
 */
export function extractEntryFields(text: string): EntryFields {
  const csl: Partial<CslItem> = {};

  const doi = text.match(DOI_RE)?.[0]?.replace(/[.,;)\]]+$/, "");
  if (doi) csl.DOI = doi;

  const arxiv = text.match(ARXIV_RE)?.[1];
  if (arxiv) csl.custom = { arxiv };

  const years = [...text.matchAll(YEAR_RE)].map((m) => Number(m[0]));
  const now = new Date().getFullYear();
  const year = years.filter((y) => y >= 1900 && y <= now + 1).at(-1);
  if (year) csl.issued = { "date-parts": [[year]] };

  // Split at sentence boundaries followed by a capital OR by common
  // lowercase venue lead-ins ("arXiv preprint", "in Proceedings", "pages").
  const segments = text
    .split(/(?<=[.?!])\s+(?=[A-Z"“]|arXiv\b|in\s|pages\s)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const authorSegment = segments[0] ?? "";
  const authors = parseAuthors(authorSegment);
  if (authors.length > 0) csl.author = authors;

  const titleGuess = pickTitleSegment(segments);
  if (titleGuess) csl.title = titleGuess;

  return { csl, titleGuess };
}

/**
 * Parse an author block ("A. Vaswani, N. Shazeer, and L. Jones" or
 * "Vaswani, A., Shazeer, N."). Names that resist parsing are kept whole as
 * CSL literal names — imperfect data beats dropped data.
 */
function parseAuthors(segment: string): CslName[] {
  const cleaned = segment.replace(/\bet al\.?/gi, "").replace(/\.$/, "");
  if (cleaned.length === 0 || cleaned.length > 300) return [];

  const parts = cleaned
    .split(/,\s*(?:and\s+)?|\s+and\s+/i)
    .map((p) => p.trim())
    .filter((p) => p.length > 1);

  // "Family, G." style splits family and initials into separate parts — stitch
  // pairs back together when a part is only initials.
  const names: CslName[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const next = parts[i + 1];
    if (next && /^([A-Z]\.\s*)+$/.test(next)) {
      names.push({ family: part, given: next.trim() });
      i++;
    } else if (
      /^([A-Z]\.\s*)+[\p{L}'’-]+/u.test(part) ||
      /^[A-Z][\p{L}'’.-]*(\s+[\p{L}'’.-]+)*$/u.test(part)
    ) {
      names.push(splitGivenFamily(part));
    } else {
      names.push({ literal: part });
    }
  }
  return names.slice(0, 30);
}

const PARTICLES = new Set([
  "van",
  "von",
  "der",
  "den",
  "de",
  "del",
  "della",
  "da",
  "di",
  "la",
  "le",
  "ter",
  "ten",
  "dos",
  "du",
]);

/** "Laurens van der Maaten" → family "van der Maaten", given "Laurens". */
function splitGivenFamily(part: string): CslName {
  const tokens = part.split(/\s+/);
  if (tokens.length === 1) return { literal: part };
  let familyStart = tokens.length - 1;
  for (let i = 1; i < tokens.length - 1; i++) {
    if (PARTICLES.has(tokens[i].toLowerCase())) {
      familyStart = i;
      break;
    }
  }
  return {
    family: tokens.slice(familyStart).join(" "),
    given: tokens.slice(0, familyStart).join(" "),
  };
}

function pickTitleSegment(segments: string[]): string | null {
  const clean = (s: string) =>
    s.replace(/[.]$/, "").replace(/^["“]|["”]$/g, "");

  // APA places the title directly after the parenthesized year:
  // "Devlin, J., Chang, M. W. (2019). Title here. Venue." — split there first.
  const afterYear = segments
    .join(" ")
    .split(/\((?:19|20)\d{2}[a-z]?\)[.:]?\s+/)[1];
  if (afterYear) {
    const seg = afterYear.split(/(?<=\.)\s+(?=[A-Z"“])/)[0]?.trim();
    if (seg && seg.split(/\s+/).length >= 3 && !DOI_RE.test(seg))
      return clean(seg);
  }

  const candidates = segments.slice(1, 4).filter((s) => {
    const words = s.split(/\s+/);
    if (
      words.length < 3 ||
      DOI_RE.test(s) ||
      /^(in|proceedings|journal|arxiv)\b/i.test(s)
    )
      return false;
    // Reject author-list continuations: segments dominated by initials.
    const initials = words.filter((w) => /^[A-Z]\.?,?$/.test(w)).length;
    return initials / words.length < 0.4;
  });
  const best = candidates[0] ?? null;
  // A trailing ", 2001" is list formatting, not part of the title.
  return best ? clean(best).replace(/,\s*(?:19|20)\d{2}$/, "") : null;
}
