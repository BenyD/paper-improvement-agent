import type { CslItem } from "../csl/types";
import { openAlexSearch } from "./openalex";
import { s2Search } from "./semanticscholar";

export interface Resolution {
  status: "verified" | "low-confidence" | "unverified";
  source?: "openalex" | "semanticscholar";
  /** Canonical link for the matched work — every verified entry is linkable. */
  url?: string;
  /** Title similarity that justified the match (identifier hits score 1). */
  score?: number;
  note?: string;
}

export interface ResolvedEntry {
  csl: CslItem;
  resolution: Resolution;
}

const MATCH_THRESHOLD = 0.75;

/**
 * P5b (title path) — resolve an entry by title search when it carries no
 * usable identifier (identifier lookups are batched in the pipeline).
 *
 * Following Crossref's SBMV design, a title match alone never earns
 * "verified": candidates are validated against the reference's year (±1) and
 * the candidate first author's surname appearing in the raw reference text.
 * An explicit contradiction demotes the match to "low-confidence" (linked,
 * but visibly uncertain); corroboration promotes it to "verified". We never
 * fabricate a match.
 */
export async function resolveByTitle(
  id: string,
  local: Partial<CslItem>,
  titleGuess: string | null,
  rawText: string,
): Promise<ResolvedEntry> {
  const keepId = (item: CslItem): CslItem => ({ ...item, id });
  const asLocal = (): CslItem => ({ id, type: "article", ...local });

  if (!titleGuess) {
    return {
      csl: asLocal(),
      resolution: {
        status: "unverified",
        note: "No title could be extracted to search with.",
      },
    };
  }

  const errors: string[] = [];
  let fallback: ResolvedEntry | null = null;

  for (const [source, search] of [
    ["openalex", openAlexSearch],
    ["semanticscholar", s2Search],
  ] as const) {
    try {
      const candidates = await search(titleGuess);
      // Classify every candidate over the threshold and prefer a corroborated
      // one — the top search hit is not always the right work (e.g. a title
      // fully contained in a longer, wrong title can outscore the true match).
      let bestVerified: { item: CslItem; score: number } | null = null;
      let bestLow: { item: CslItem; score: number } | null = null;
      for (const item of candidates) {
        if (!item.title) continue;
        const score = titleSimilarity(titleGuess, item.title);
        const verdict = classifyMatch(
          score,
          ...corroborate(local, rawText, item),
        );
        if (
          verdict === "verified" &&
          (bestVerified === null || score > bestVerified.score)
        )
          bestVerified = { item, score };
        if (
          verdict === "low-confidence" &&
          (bestLow === null || score > bestLow.score)
        )
          bestLow = { item, score };
      }

      if (bestVerified) {
        return {
          csl: keepId(bestVerified.item),
          resolution: {
            status: "verified",
            source,
            url: bestVerified.item.URL,
            score: bestVerified.score,
          },
        };
      }
      if (bestLow && fallback === null) {
        fallback = {
          csl: keepId(bestLow.item),
          resolution: {
            status: "low-confidence",
            source,
            url: bestLow.item.URL,
            score: bestLow.score,
            note: "Title matches but year/author could not be corroborated; check before trusting.",
          },
        };
      }
    } catch (err) {
      errors.push(
        `${source === "openalex" ? "OpenAlex" : "Semantic Scholar"}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  if (fallback) return fallback;

  return {
    csl: asLocal(),
    resolution: {
      status: "unverified",
      note:
        errors.length > 0
          ? `Search failed — ${errors.join("; ")}. Entry kept as parsed.`
          : "No sufficiently similar title on OpenAlex or Semantic Scholar.",
    },
  };
}

/**
 * Corroboration signals: true = agrees, false = contradicts, null = unknown.
 */
export function corroborate(
  local: Partial<CslItem>,
  rawText: string,
  candidate: CslItem,
): [yearOk: boolean | null, authorOk: boolean | null] {
  const localYear = local.issued?.["date-parts"]?.[0]?.[0];
  const candYear = candidate.issued?.["date-parts"]?.[0]?.[0];
  const yearOk =
    localYear && candYear ? Math.abs(localYear - candYear) <= 1 : null;

  const fam =
    candidate.author?.[0]?.family ??
    candidate.author?.[0]?.literal?.split(/\s+/).at(-1);
  const authorOk =
    fam && fam.length > 2
      ? rawText.toLowerCase().includes(fam.toLowerCase())
      : null;

  return [yearOk, authorOk];
}

/**
 * Crossref-style verdict: contradiction → low-confidence; corroboration →
 * verified; no signals either way → verified only on a near-perfect title.
 */
export function classifyMatch(
  score: number,
  yearOk: boolean | null,
  authorOk: boolean | null,
): "verified" | "low-confidence" | "rejected" {
  if (score < MATCH_THRESHOLD) return "rejected";
  if (yearOk === false || authorOk === false) return "low-confidence";
  if (yearOk === true || authorOk === true) return "verified";
  return score >= 0.9 ? "verified" : "low-confidence";
}

/**
 * Token-level similarity over normalized words — robust to punctuation/case.
 * Jaccard over the larger set, except when one title fully contains the other
 * (a truncated title guess vs the full recorded title): containment with 4+
 * matching tokens scores by the smaller set, so "A decomposable attention
 * model" still matches "A Decomposable Attention Model for Natural Language
 * Inference".
 */
export function titleSimilarity(a: string, b: string): number {
  const tokens = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter((t) => t.length > 1),
    );
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let overlap = 0;
  for (const t of ta) if (tb.has(t)) overlap++;
  const smaller = Math.min(ta.size, tb.size);
  if (overlap === smaller && smaller >= 4) return overlap / smaller;
  return overlap / Math.max(ta.size, tb.size);
}
