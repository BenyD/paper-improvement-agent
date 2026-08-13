import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { CslItem } from "@/lib/csl/types";
import type { PaperDocument } from "@/lib/doc/types";
import { openAlexSearch } from "@/lib/sources/openalex";
import { titleSimilarity } from "@/lib/sources/resolve";
import { s2Search } from "@/lib/sources/semanticscholar";
import { structured } from "../client";
import { QUERY_GENERATION, RELEVANCE_JUDGMENT } from "../instructions";
import type { SectionExcerpt } from "./context";
import type { Finding } from "./types";

const QuerySchema = z.object({
  queries: z.array(
    z.object({
      sectionId: z.string(),
      query: z.string().min(8).max(120),
    }),
  ),
});

export async function generateQueries(
  doc: PaperDocument,
  sections: SectionExcerpt[],
): Promise<{ sectionId: string; query: string }[]> {
  const user = [
    `Paper title: ${doc.title}`,
    `Abstract: ${doc.abstract.slice(0, 1200)}`,
    "",
    "Sections:",
    ...sections.map(
      (s) => `--- [${s.sectionId}] ${s.heading}\n${s.excerpt.slice(0, 700)}`,
    ),
  ].join("\n");

  const result = await structured({
    system: QUERY_GENERATION,
    user,
    toolName: "propose_queries",
    description: "Propose academic search queries per section.",
    schema: QuerySchema,
  });

  // Deterministic guard: at most 2 queries per known section.
  const perSection = new Map<string, number>();
  const known = new Set(sections.map((s) => s.sectionId));
  return result.queries.filter((q) => {
    if (!known.has(q.sectionId)) return false;
    const n = perSection.get(q.sectionId) ?? 0;
    if (n >= 2) return false;
    perSection.set(q.sectionId, n + 1);
    return true;
  });
}

/**
 * Deterministic dedupe: a candidate is out if its DOI matches an existing
 * reference, its title is near-identical (≥ 0.75) to one, or it repeats an
 * earlier candidate. The paper itself is filtered the same way.
 */
export function dedupeCandidates(
  candidates: CslItem[],
  doc: PaperDocument,
): CslItem[] {
  const existingDois = new Set(
    doc.citations.entries
      .map((e) => e.csl.DOI?.toLowerCase())
      .filter((d): d is string => Boolean(d)),
  );
  const existingTitles = doc.citations.entries
    .map((e) => e.csl.title)
    .filter((t): t is string => Boolean(t));

  const out: CslItem[] = [];
  const maxYear = doc.meta.year;
  for (const c of candidates) {
    if (!c.title) continue;
    const y = c.issued?.["date-parts"]?.[0]?.[0];
    if (maxYear && y && y > maxYear) continue; // cannot be "missing" from an older paper
    if (c.DOI && existingDois.has(c.DOI.toLowerCase())) continue;
    if (titleSimilarity(c.title, doc.title) >= 0.8) continue; // the paper itself
    if (
      existingTitles.some((t) => titleSimilarity(c.title as string, t) >= 0.75)
    )
      continue;
    if (
      out.some((o) => titleSimilarity(c.title as string, o.title ?? "") >= 0.85)
    )
      continue;
    out.push(c);
  }
  return out;
}

const RelevanceSchema = z.object({
  relevant: z.array(
    z.object({
      index: z.number().int().min(0),
      whereAndWhy: z.string(),
      confidence: z.enum(["high", "medium", "low"]),
    }),
  ),
});

const MAX_FINDINGS_PER_SECTION = 3;

export async function judgeCandidates(
  doc: PaperDocument,
  section: SectionExcerpt,
  candidates: CslItem[],
): Promise<Finding[]> {
  if (candidates.length === 0) return [];

  const user = [
    `Paper title: ${doc.title}`,
    `Abstract: ${doc.abstract.slice(0, 800)}`,
    "",
    `Section under review: ${section.heading}`,
    section.excerpt,
    "",
    "Candidate papers:",
    ...candidates.map(
      (c, i) =>
        `${i}. "${c.title}" (${c.issued?.["date-parts"]?.[0]?.[0] ?? "?"})\n${(c.abstract ?? "no abstract").slice(0, 500)}`,
    ),
  ].join("\n");

  const result = await structured({
    system: RELEVANCE_JUDGMENT,
    user,
    toolName: "report_relevant",
    description:
      "Report which candidates are genuinely relevant missing citations.",
    schema: RelevanceSchema,
    maxTokens: 2000,
  });

  const findings: Finding[] = [];
  for (const r of result.relevant.slice(0, MAX_FINDINGS_PER_SECTION)) {
    const c = candidates[r.index];
    if (!c?.URL) continue;
    findings.push({
      id: randomUUID(),
      kind: "missing-work",
      severity: "medium",
      confidence: r.confidence,
      sectionId: section.sectionId,
      summary: `Consider citing "${c.title}" in ${section.heading}`,
      detail: r.whereAndWhy,
      source: {
        title: c.title ?? "",
        url: c.URL,
        year: c.issued?.["date-parts"]?.[0]?.[0],
        authors: (c.author ?? [])
          .slice(0, 3)
          .map((a) => a.family ?? a.literal ?? "")
          .join(", "),
      },
    });
  }
  return findings;
}

/** Search both APIs; failures come back as notes, never invented results. */
export async function searchCandidates(
  query: string,
  maxYear?: number | null,
): Promise<{ items: CslItem[]; notes: string[] }> {
  const notes: string[] = [];
  const items: CslItem[] = [];
  try {
    items.push(...(await openAlexSearch(query, 5, maxYear)));
  } catch (err) {
    notes.push(
      `OpenAlex search failed for "${query}": ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  try {
    items.push(...(await s2Search(query, 5, maxYear)));
  } catch (err) {
    notes.push(
      `Semantic Scholar search failed for "${query}": ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return { items, notes };
}
