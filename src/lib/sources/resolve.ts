import type { CslItem } from "../csl/types";
import { openAlexByDoi, openAlexSearch } from "./openalex";
import { s2ByArxiv, s2Search } from "./semanticscholar";

export interface Resolution {
  status: "verified" | "unverified";
  source?: "openalex" | "semanticscholar";
  /** Canonical link for the verified work — every verified entry is linkable. */
  url?: string;
  /** Title similarity that justified the match (identifier hits score 1). */
  score?: number;
  note?: string;
}

export interface ResolvedEntry {
  csl: CslItem;
  resolution: Resolution;
}

/**
 * P5b — Resolve a locally-parsed entry against real academic databases.
 *
 * Order: DOI (exact, OpenAlex) → arXiv id (exact, Semantic Scholar) → title
 * search (OpenAlex first — generous rate limits — then Semantic Scholar),
 * accepted only when normalized title similarity ≥ 0.75. A verified entry
 * adopts the database's richer CSL record (keeping our id); an unresolved one
 * keeps the local best-effort CSL and an honest "unverified" flag. We never
 * fabricate a match.
 */
export async function resolveEntry(
  id: string,
  local: Partial<CslItem>,
  titleGuess: string | null,
): Promise<ResolvedEntry> {
  const keepId = (item: CslItem): CslItem => ({ ...item, id });

  if (local.DOI) {
    const hit = await openAlexByDoi(local.DOI);
    if (hit)
      return {
        csl: keepId(hit),
        resolution: {
          status: "verified",
          source: "openalex",
          url: hit.URL,
          score: 1,
        },
      };
  }

  if (local.custom?.arxiv) {
    const hit = await s2ByArxiv(local.custom.arxiv);
    if (hit) {
      return {
        csl: keepId(hit),
        resolution: {
          status: "verified",
          source: "semanticscholar",
          url: hit.URL,
          score: 1,
        },
      };
    }
    // OpenAlex indexes arXiv papers under DataCite DOIs — exact fallback.
    const oaHit = await openAlexByDoi(`10.48550/arXiv.${local.custom.arxiv}`);
    if (oaHit) {
      return {
        csl: keepId(oaHit),
        resolution: {
          status: "verified",
          source: "openalex",
          url: oaHit.URL,
          score: 1,
        },
      };
    }
  }

  if (titleGuess) {
    const errors: string[] = [];
    try {
      const oa = await openAlexSearch(titleGuess);
      const best = bestMatch(titleGuess, oa);
      if (best) {
        return {
          csl: keepId(best.item),
          resolution: {
            status: "verified",
            source: "openalex",
            url: best.item.URL,
            score: best.score,
          },
        };
      }
    } catch (err) {
      errors.push(
        `OpenAlex: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    try {
      const s2 = await s2Search(titleGuess);
      const best = bestMatch(titleGuess, s2);
      if (best) {
        return {
          csl: keepId(best.item),
          resolution: {
            status: "verified",
            source: "semanticscholar",
            url: best.item.URL,
            score: best.score,
          },
        };
      }
    } catch (err) {
      errors.push(
        `Semantic Scholar: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (errors.length > 0) {
      return {
        csl: { id, type: "article", ...local },
        resolution: {
          status: "unverified",
          note: `Search failed — ${errors.join("; ")}. Entry kept as parsed.`,
        },
      };
    }
  }

  return {
    csl: { id, type: "article", ...local },
    resolution: {
      status: "unverified",
      note: titleGuess
        ? "No sufficiently similar title on OpenAlex or Semantic Scholar."
        : "No title could be extracted to search with.",
    },
  };
}

const MATCH_THRESHOLD = 0.75;

function bestMatch(
  query: string,
  candidates: CslItem[],
): { item: CslItem; score: number } | null {
  let best: { item: CslItem; score: number } | null = null;
  for (const item of candidates) {
    if (!item.title) continue;
    const score = titleSimilarity(query, item.title);
    if (score >= MATCH_THRESHOLD && (best === null || score > best.score))
      best = { item, score };
  }
  return best;
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
