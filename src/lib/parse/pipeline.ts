import { randomUUID } from "node:crypto";
import type { PaperDocument } from "../doc/types";
import { extractPdf } from "../pdf/extract";
import { locateReferences } from "./references";
import { bodyFontSize, detectStructure } from "./structure";

/**
 * The P1→P3 slice of the parsing pipeline (Phase 1).
 * P4-P6 (entry segmentation, CSL parsing/resolution, marker linking) follow in
 * Phase 2 and extend the returned document.
 */
export async function parsePaper(
  bytes: Uint8Array,
  filename: string,
): Promise<PaperDocument> {
  const extract = await extractPdf(bytes); // P1
  const structure = detectStructure(extract); // P2
  const bodySize = extract.lines.length > 0 ? bodyFontSize(extract.lines) : 0;
  const refs = locateReferences(extract, bodySize); // P3

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
    references: {
      heading: refs.heading,
      rawLines: refs.lines.map((l) => l.text),
      startPage: refs.startPage,
    },
    failures: [...extract.failures, ...structure.failures, ...refs.failures],
  };
}
