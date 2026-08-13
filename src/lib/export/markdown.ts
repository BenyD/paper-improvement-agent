import { type CslTemplate, templateForStyle } from "../csl/render";
import type { PaperDocument } from "../doc/types";
import { formatEntry } from "./latex";

/**
 * Structured Markdown export: the parsed document as a readable .md file.
 * Headings keep their hierarchy, reconstructed tables are already GitHub
 * tables, citation markers stay inline as plain text, and the reference
 * list renders through citeproc (same formatter the LaTeX export uses).
 */
export function exportMarkdown(
  doc: PaperDocument,
  styleOverride?: CslTemplate,
): string {
  const lines: string[] = [`# ${doc.title || "(untitled paper)"}`, ""];

  if (doc.abstract) {
    lines.push("## Abstract", "", plain(doc.abstract), "");
  }

  for (const section of doc.sections) {
    const depth = Math.min(section.level > 0 ? section.level + 1 : 2, 6);
    lines.push(`${"#".repeat(depth)} ${section.heading}`, "");
    for (const paragraph of section.paragraphs) {
      lines.push(plain(paragraph), "");
    }
  }

  const entries = doc.citations.entries;
  if (entries.length > 0) {
    const template =
      styleOverride ?? templateForStyle(doc.citations.citationStyle);
    lines.push("## References", "");
    for (const entry of entries) {
      const label = entry.marker ? `[${entry.marker}]` : "-";
      lines.push(`${label} ${formatEntry(entry, template)}`);
      lines.push("");
    }
  }

  return lines.join("\n");
}

/** Superscript marker tokens from P1 back to readable inline markers. */
function plain(text: string): string {
  return text.replace(/⟦\^([\d\s,;–-]+)⟧/g, "[$1]");
}
