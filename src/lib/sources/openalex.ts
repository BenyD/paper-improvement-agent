import type { CslItem, CslName } from "../csl/types";
import { cachedFetchJson } from "./cache";

const BASE = "https://api.openalex.org";
// OpenAlex "polite pool": including a mailto gets faster, more reliable service.
const MAILTO = "mailto=benydishon@gmail.com";

interface OpenAlexWork {
  id: string;
  display_name: string;
  publication_year?: number;
  doi?: string;
  type?: string;
  authorships?: { author: { display_name: string } }[];
  primary_location?: { source?: { display_name?: string } };
  biblio?: { volume?: string; first_page?: string; last_page?: string };
  abstract_inverted_index?: Record<string, number[]>;
}

export async function openAlexByDoi(doi: string): Promise<CslItem | null> {
  try {
    const work = (await cachedFetchJson(
      `${BASE}/works/https://doi.org/${encodeURIComponent(doi)}?${MAILTO}`,
    )) as OpenAlexWork;
    return toCsl(work);
  } catch {
    return null;
  }
}

/**
 * Batch DOI lookup via OpenAlex's OR-filter (up to 50 DOIs per request).
 * Returns a map keyed by lowercase DOI; absent keys mean OpenAlex has no
 * record — an honest miss, not an error.
 */
export async function openAlexByDois(
  dois: string[],
): Promise<Map<string, CslItem>> {
  const out = new Map<string, CslItem>();
  for (let i = 0; i < dois.length; i += 50) {
    const chunk = dois.slice(i, i + 50);
    const url = `${BASE}/works?filter=doi:${chunk.join("|")}&per-page=50&${MAILTO}`;
    try {
      const res = (await cachedFetchJson(url)) as { results?: OpenAlexWork[] };
      for (const work of res.results ?? []) {
        const doi = work.doi
          ?.replace(/^https:\/\/doi\.org\//, "")
          .toLowerCase();
        if (doi) out.set(doi, toCsl(work));
      }
    } catch {
      // chunk failed — entries fall through to the title-search path
    }
  }
  return out;
}

export async function openAlexSearch(
  query: string,
  perPage = 5,
): Promise<CslItem[]> {
  // OpenAlex 400s on some punctuation in search strings — keep letters/digits.
  const sanitized = query
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const url = `${BASE}/works?search=${encodeURIComponent(sanitized)}&per-page=${perPage}&${MAILTO}`;
  const res = (await cachedFetchJson(url)) as { results?: OpenAlexWork[] };
  return (res.results ?? []).map(toCsl);
}

const TYPE_MAP: Record<string, CslItem["type"]> = {
  article: "article-journal",
  "journal-article": "article-journal",
  "proceedings-article": "paper-conference",
  book: "book",
  "book-chapter": "chapter",
  report: "report",
  dissertation: "thesis",
  preprint: "article",
};

function toCsl(work: OpenAlexWork): CslItem {
  const authors: CslName[] = (work.authorships ?? []).map((a) => {
    const tokens = a.author.display_name.split(/\s+/);
    return tokens.length > 1
      ? { family: tokens.at(-1), given: tokens.slice(0, -1).join(" ") }
      : { literal: a.author.display_name };
  });

  const item: CslItem = {
    id: work.id,
    type: TYPE_MAP[work.type ?? ""] ?? "article",
    title: work.display_name,
    author: authors.length > 0 ? authors : undefined,
    URL: work.id,
    custom: { openalex: work.id },
  };
  if (work.publication_year)
    item.issued = { "date-parts": [[work.publication_year]] };
  if (work.doi) item.DOI = work.doi.replace(/^https:\/\/doi\.org\//, "");
  const venue = work.primary_location?.source?.display_name;
  if (venue) item["container-title"] = venue;
  if (work.biblio?.volume) item.volume = work.biblio.volume;
  if (work.biblio?.first_page && work.biblio.last_page)
    item.page = `${work.biblio.first_page}-${work.biblio.last_page}`;
  const abstract = reconstructAbstract(work.abstract_inverted_index);
  if (abstract) item.abstract = abstract;
  return item;
}

/** OpenAlex stores abstracts as an inverted index; rebuild the plain text. */
export function reconstructAbstract(
  index?: Record<string, number[]>,
): string | null {
  if (!index) return null;
  const words: string[] = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const pos of positions) words[pos] = word;
  }
  const text = words.filter(Boolean).join(" ");
  return text.length > 0 ? text : null;
}
