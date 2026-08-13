import type { CslItem, CslName } from "../csl/types";
import { cachedFetchJson } from "./cache";

const BASE = "https://api.semanticscholar.org/graph/v1";
const FIELDS = "title,year,authors,abstract,externalIds,venue,url";

interface S2Paper {
  paperId: string;
  title: string;
  year?: number;
  venue?: string;
  url?: string;
  abstract?: string;
  authors?: { name: string }[];
  externalIds?: { DOI?: string; ArXiv?: string };
}

function headers(): Record<string, string> {
  const key = process.env.SEMANTIC_SCHOLAR_API_KEY;
  return key ? { "x-api-key": key } : {};
}

// Rate limiting and retry live centrally in cachedFetchJson (per-host queues).

/**
 * Batch lookup via POST /paper/batch (up to 500 ids per request — one call
 * for a whole reference list instead of N dice-rolls against the shared
 * unauthenticated rate limit). Ids like "arXiv:1607.06450" or "DOI:10...".
 * Returns a map keyed by the input id; misses are absent, not fabricated.
 */
export async function s2Batch(ids: string[]): Promise<Map<string, CslItem>> {
  const out = new Map<string, CslItem>();
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    try {
      const res = (await cachedFetchJson(
        `${BASE}/paper/batch?fields=${FIELDS}`,
        headers(),
        {
          body: { ids: chunk },
        },
      )) as (S2Paper | null)[];
      res.forEach((paper, j) => {
        if (paper) out.set(chunk[j], toCsl(paper));
      });
    } catch {
      // chunk failed — entries fall through to other resolution paths
    }
  }
  return out;
}

export async function s2ByArxiv(arxivId: string): Promise<CslItem | null> {
  try {
    const paper = (await cachedFetchJson(
      `${BASE}/paper/arXiv:${arxivId}?fields=${FIELDS}`,
      headers(),
    )) as S2Paper;
    return toCsl(paper);
  } catch {
    return null;
  }
}

export async function s2Search(
  query: string,
  limit = 5,
  maxYear?: number | null,
): Promise<CslItem[]> {
  const yearParam = maxYear ? `&year=1900-${maxYear}` : "";
  const url = `${BASE}/paper/search?query=${encodeURIComponent(query)}&limit=${limit}${yearParam}&fields=${FIELDS}`;
  const res = (await cachedFetchJson(url, headers())) as { data?: S2Paper[] };
  return (res.data ?? []).map(toCsl);
}

function toCsl(paper: S2Paper): CslItem {
  const authors: CslName[] = (paper.authors ?? []).map((a) => {
    const tokens = a.name.split(/\s+/);
    return tokens.length > 1
      ? { family: tokens.at(-1), given: tokens.slice(0, -1).join(" ") }
      : { literal: a.name };
  });

  const item: CslItem = {
    id: `s2:${paper.paperId}`,
    type: paper.venue ? "paper-conference" : "article",
    title: paper.title,
    author: authors.length > 0 ? authors : undefined,
    URL: paper.url ?? `https://www.semanticscholar.org/paper/${paper.paperId}`,
    custom: { semanticScholar: paper.paperId },
  };
  if (paper.year) item.issued = { "date-parts": [[paper.year]] };
  if (paper.externalIds?.DOI) item.DOI = paper.externalIds.DOI;
  if (paper.externalIds?.ArXiv)
    item.custom = { ...item.custom, arxiv: paper.externalIds.ArXiv };
  if (paper.venue) item["container-title"] = paper.venue;
  if (paper.abstract) item.abstract = paper.abstract;
  return item;
}
