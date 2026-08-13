import { randomUUID } from "node:crypto";
import type { PaperDocument, ReferenceEntry } from "../doc/types";
import { extractPdf } from "../pdf/extract";
import { openAlexByDois } from "../sources/openalex";
import { resolveByTitle } from "../sources/resolve";
import { s2Batch } from "../sources/semanticscholar";
import { extractEntryFields } from "./entry";
import { linkMarkers } from "./markers";
import { locateReferences } from "./references";
import { segmentReferences } from "./segment";
import { bodyFontSize, detectStructure } from "./structure";

/**
 * The local parsing pipeline, P1→P6. Pure (no network): resolution against
 * OpenAlex/Semantic Scholar happens separately in `resolveCitations` so the
 * deterministic parse and the networked verification stay separate concerns.
 */
export async function parsePaper(
  bytes: Uint8Array,
  filename: string,
): Promise<PaperDocument> {
  const extract = await extractPdf(bytes); // P1
  const structure = detectStructure(extract); // P2
  const bodySize = extract.lines.length > 0 ? bodyFontSize(extract.lines) : 0;
  const refs = locateReferences(extract, bodySize); // P3
  const segmented = segmentReferences(refs.lines); // P4

  const entries: ReferenceEntry[] = segmented.entries.map((raw, i) => {
    const fields = extractEntryFields(raw.text); // P5a (local)
    return {
      id: `ref-${raw.marker ?? i + 1}`,
      marker: raw.marker,
      rawText: raw.text,
      csl: { id: `ref-${raw.marker ?? i + 1}`, type: "article", ...fields.csl },
      resolution: {
        status: "unverified",
        note: "Not yet checked against academic search.",
      },
    };
  });

  const paperYear = computePaperYear(
    extract.docMeta.year,
    entries
      .map((e) => e.csl.issued?.["date-parts"]?.[0]?.[0])
      .filter((y): y is number => Boolean(y)),
  );

  const twoColumnPages = extract.pages.filter((p) => p.columns === 2).length;
  const layout =
    twoColumnPages > extract.pages.length / 2
      ? "two-column"
      : twoColumnPages > 0
        ? "mixed-column"
        : "single-column";

  // The references region is not body text; drop sections that fall inside it.
  const sections = structure.sections.filter(
    (s) =>
      !/^(references|bibliography|works cited|literature cited)\b/i.test(
        s.heading,
      ),
  );

  const linked = linkMarkers(
    sections,
    entries.map((e) => ({
      id: e.id,
      marker: e.marker,
      csl: e.csl,
      rawText: e.rawText,
    })),
  ); // P6

  return {
    id: randomUUID(),
    meta: {
      filename,
      uploadedAt: new Date().toISOString(),
      pageCount: extract.pages.length,
      layout,
      year: paperYear,
    },
    title: structure.title || extract.docMeta.title || "",
    abstract: structure.abstract,
    sections,
    citations: {
      entryStyle: segmented.style,
      citationStyle: linked.style,
      entries,
      markers: linked.markers,
    },
    references: {
      heading: refs.heading,
      rawLines: refs.lines.map((l) => l.text),
      startPage: refs.startPage,
    },
    failures: [
      ...extract.failures,
      ...structure.failures,
      ...refs.failures,
      ...segmented.failures,
      ...linked.failures,
    ],
  };
}

/**
 * The paper's own publication year. References cannot postdate the paper, so
 * the newest reference year is a solid lower bound; PDF CreationDate can lag
 * (arXiv revisions are re-rendered years later), so references win when newer
 * is claimed by metadata alone the other way.
 */
export function computePaperYear(
  metaYear: number | null,
  refYears: number[],
): number | null {
  const maxRef = refYears.length > 0 ? Math.max(...refYears) : null;
  if (maxRef && metaYear)
    return Math.max(maxRef, Math.min(metaYear, maxRef + 1));
  return maxRef ?? metaYear;
}

/**
 * P5b — Verify every entry against OpenAlex / Semantic Scholar.
 *
 * Batch-first (Crossref-style efficiency, our honesty rules):
 *  1. All DOIs in one OpenAlex OR-filter batch (50/request) — exact matches.
 *  2. Remaining arXiv ids in one Semantic Scholar POST /paper/batch — exact.
 *  3. arXiv ids S2 missed retry as OpenAlex DataCite DOIs (10.48550/arXiv.x).
 *  4. Only the leftovers hit the per-entry title-search path, where matches
 *     must survive year/author corroboration (see resolveByTitle).
 * Mutates nothing: returns the document with enriched entries.
 */
export async function resolveCitations(
  doc: PaperDocument,
  opts: { onlyUnverified?: boolean } = {},
): Promise<PaperDocument> {
  const entries = [...doc.citations.entries];
  const fields = entries.map((e) => extractEntryFields(e.rawText));
  // Re-verification mode touches only entries that are not yet verified —
  // verified entries and edit-added references keep their records untouched.
  const pending = new Set(
    entries
      .map((_, i) => i)
      .filter(
        (i) =>
          !opts.onlyUnverified || entries[i].resolution.status !== "verified",
      ),
  );

  const verify = (
    i: number,
    csl: import("../csl/types").CslItem,
    source: "openalex" | "semanticscholar",
  ) => {
    entries[i] = {
      ...entries[i],
      csl: { ...csl, id: entries[i].id },
      resolution: { status: "verified", source, url: csl.URL, score: 1 },
    };
    pending.delete(i);
  };

  // 1. DOI batch via OpenAlex.
  const doiIndex = new Map<string, number>();
  for (const i of pending) {
    const doi = fields[i].csl.DOI?.toLowerCase();
    if (doi) doiIndex.set(doi, i);
  }
  if (doiIndex.size > 0) {
    const hits = await openAlexByDois([...doiIndex.keys()]);
    for (const [doi, item] of hits) {
      const i = doiIndex.get(doi);
      if (i !== undefined) verify(i, item, "openalex");
    }
  }

  // 2. arXiv batch via Semantic Scholar.
  const arxivIndex = new Map<string, number>();
  for (const i of pending) {
    const arxiv = fields[i].csl.custom?.arxiv;
    if (arxiv) arxivIndex.set(`arXiv:${arxiv}`, i);
  }
  if (arxivIndex.size > 0) {
    const hits = await s2Batch([...arxivIndex.keys()]);
    for (const [id, item] of hits) {
      const i = arxivIndex.get(id);
      if (i !== undefined) verify(i, item, "semanticscholar");
    }
  }

  // 3. arXiv ids S2 missed → OpenAlex DataCite DOIs.
  const dataciteIndex = new Map<string, number>();
  for (const i of pending) {
    const arxiv = fields[i].csl.custom?.arxiv;
    if (arxiv) dataciteIndex.set(`10.48550/arxiv.${arxiv}`.toLowerCase(), i);
  }
  if (dataciteIndex.size > 0) {
    const hits = await openAlexByDois([...dataciteIndex.keys()]);
    for (const [doi, item] of hits) {
      const i = dataciteIndex.get(doi);
      if (i !== undefined) verify(i, item, "openalex");
    }
  }

  // 4. Title search for the rest, corroborated before trusting.
  const leftovers = [...pending];
  const CONCURRENCY = 4;
  let next = 0;
  async function worker(): Promise<void> {
    while (next < leftovers.length) {
      const i = leftovers[next++];
      const resolved = await resolveByTitle(
        entries[i].id,
        fields[i].csl,
        fields[i].titleGuess,
        entries[i].rawText,
      );
      entries[i] = {
        ...entries[i],
        csl: resolved.csl,
        resolution: resolved.resolution,
      };
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, leftovers.length) }, worker),
  );

  return { ...doc, citations: { ...doc.citations, entries } };
}
