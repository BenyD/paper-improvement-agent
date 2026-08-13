import type { PaperDocument } from "@/lib/doc/types";
import { stripSupTokens } from "../review/context";

/**
 * The document as the edit agent sees it: sections with stable ids and
 * original paragraph indices, plus the reference library. Sent as a cached
 * system block (prompt caching) since it repeats across every loop turn.
 */
export function buildDocumentContext(doc: PaperDocument): string {
  const lines: string[] = [
    `PAPER: ${doc.title}`,
    `Citation style: ${doc.citations.citationStyle} · Reference list style: ${doc.citations.entryStyle}`,
    "",
    "ABSTRACT:",
    doc.abstract,
    "",
    "SECTIONS (cite paragraphs as sectionId/index):",
  ];

  for (const section of doc.sections) {
    lines.push(`\n## [${section.id}] ${section.heading}`);
    section.paragraphs.forEach((p, i) => {
      lines.push(`(${section.id}/${i}) ${stripSupTokens(p)}`);
    });
  }

  lines.push("\nREFERENCES:");
  for (const e of doc.citations.entries) {
    const year = e.csl.issued?.["date-parts"]?.[0]?.[0] ?? "?";
    const cited = doc.citations.markers.some((m) => m.targets.includes(e.id));
    lines.push(
      `[${e.marker ?? e.id}] ${e.csl.title ?? e.rawText.slice(0, 80)} (${year})${cited ? "" : " — never cited in text"}`,
    );
  }

  return lines.join("\n");
}
