import { randomUUID } from "node:crypto";
import type { PaperDocument, ReferenceEntry } from "../doc/types";
import { extractPdf } from "../pdf/extract";
import { resolveEntry } from "../sources/resolve";
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
    },
    title: structure.title,
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
 * P5b — Verify every entry against OpenAlex / Semantic Scholar (see
 * resolveEntry for the order and honesty rules). Mutates nothing: returns the
 * document with enriched entries. Concurrency-limited to stay polite.
 */
export async function resolveCitations(
  doc: PaperDocument,
): Promise<PaperDocument> {
  const entries = [...doc.citations.entries];
  const CONCURRENCY = 4;

  let next = 0;
  async function worker(): Promise<void> {
    while (next < entries.length) {
      const i = next++;
      const entry = entries[i];
      const fields = extractEntryFields(entry.rawText);
      const resolved = await resolveEntry(
        entry.id,
        fields.csl,
        fields.titleGuess,
      );
      entries[i] = {
        ...entry,
        csl: resolved.csl,
        resolution: resolved.resolution,
      };
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, entries.length) }, worker),
  );

  return { ...doc, citations: { ...doc.citations, entries } };
}
