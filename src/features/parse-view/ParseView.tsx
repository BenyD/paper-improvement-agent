import {
  AlignLeft,
  ArrowLeft,
  BookOpen,
  Calendar,
  ChevronRight,
  Columns2,
  FileText,
  ListTree,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ExportActions } from "@/features/export/ExportActions";
import type { PaperDocument } from "@/lib/doc/types";
import { isMarkdownTable } from "@/lib/parse/tables";
import { CitationsTable } from "./CitationsTable";
import { InlineIssues, issuesFor } from "./InlineIssues";
import { SourcePdfPane, SourcePdfProvider, SourcePdfToggle } from "./SourcePdf";
import { StructureToggle } from "./StructureToggle";

/** Render a reconstructed markdown table paragraph as a real table. */
function MarkdownTable({ markdown }: { markdown: string }) {
  const rows = markdown
    .split("\n")
    .filter((r) => !/^\| ?---/.test(r))
    .map((r) =>
      r
        .replace(/^\| /, "")
        .replace(/ \|$/, "")
        .split(" | ")
        .map((c) => c.replace(/\\\|/g, "|")),
    );
  const [header, ...body] = rows;
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-muted/40">
            {header.map((c, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static table render
              <th key={i} className="px-2.5 py-1.5 text-left font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static table render
            <tr key={i} className="border-t border-border/60">
              {row.map((c, j) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: static table render
                <td
                  key={j}
                  className="px-2.5 py-1.5 align-top text-muted-foreground"
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * PDF tables have no text structure — their cells extract as loose numeric
 * fragments. Detect paragraphs dominated by such tokens so the UI can present
 * them as layout data rather than prose (they stay in the document: honesty,
 * and the exporter keeps working with the full content).
 */
function isTableDebris(text: string): boolean {
  const tokens = text.split(/\s+/);
  if (tokens.length < 4) return false;
  const dataish = tokens.filter(
    (t) => /^[\d.,()%×±\-–]+$/.test(t) || t.length <= 2,
  ).length;
  return dataish / tokens.length >= 0.6;
}

/** Render ⟦^n⟧ superscript-marker tokens from P1 as real superscripts. */
function renderParagraph(text: string) {
  const parts = text.split(/⟦\^([\d\s,;–-]+)⟧/);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: static render of parsed text
      <sup key={i} className="text-primary">
        [{part}]
      </sup>
    ) : (
      part
    ),
  );
}

export function ParseView({ doc }: { doc: PaperDocument }) {
  return (
    <SourcePdfProvider>
      <div className="flex w-full flex-col lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-8 px-4 py-6 sm:px-8 lg:px-10">
          <header className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Link
                href="/"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ArrowLeft className="size-4" aria-hidden />
                All papers
              </Link>
              <div className="flex items-center gap-2">
                <SourcePdfToggle />
                <ExportActions doc={doc} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <h1 className="text-2xl font-semibold leading-snug tracking-tight sm:text-3xl">
                {doc.title || "(no title detected)"}
              </h1>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge
                  variant="outline"
                  className="max-w-72 text-muted-foreground"
                  title={doc.meta.filename}
                >
                  <FileText aria-hidden />
                  <span className="truncate">{doc.meta.filename}</span>
                </Badge>
                <Badge variant="outline" className="text-muted-foreground">
                  <BookOpen aria-hidden /> {doc.meta.pageCount} pages
                </Badge>
                <Badge variant="outline" className="text-muted-foreground">
                  <Columns2 aria-hidden /> {doc.meta.layout}
                </Badge>
                {doc.meta.year && (
                  <Badge variant="outline" className="text-muted-foreground">
                    <Calendar aria-hidden /> {doc.meta.year}
                  </Badge>
                )}
              </div>
            </div>
          </header>

          {doc.abstract !== "" && (
            <Card>
              <CardContent>
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Abstract
                </h2>
                <p className="text-sm leading-relaxed">{doc.abstract}</p>
              </CardContent>
            </Card>
          )}

          <section aria-labelledby="structure-heading">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2
                id="structure-heading"
                className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground"
              >
                <ListTree className="size-4" aria-hidden />
                Structure ({doc.sections.length} sections)
              </h2>
              <StructureToggle />
            </div>
            <InlineIssues failures={issuesFor(doc.failures, "structure")} />
            <ul className="flex flex-col gap-1">
              {doc.sections.map((section, idx) => {
                // A parent heading like "6 Results" whose text all lives in its
                // subsections has no direct paragraphs: render it as a plain row
                // instead of a collapsible that would expand into an empty box.
                if (section.paragraphs.length === 0) {
                  const hasSubsections =
                    (doc.sections[idx + 1]?.level ?? 0) > section.level;
                  // A parent whose text lives in its subsections renders in the
                  // same card language as its siblings; the muted fill marks it
                  // as the group header for the rows beneath.
                  return (
                    <li key={section.id}>
                      <div
                        className={`rounded-lg border border-border px-4 py-2.5 text-sm font-medium ${hasSubsections ? "bg-muted/40" : ""}`}
                        style={{
                          paddingLeft: `${1 + (section.level > 0 ? section.level - 1 : 0) * 1.25}rem`,
                        }}
                      >
                        <span className="flex items-center justify-between gap-3">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span className="size-4 shrink-0" aria-hidden />
                            <span className="truncate">{section.heading}</span>
                          </span>
                          <span className="shrink-0 text-xs font-normal text-muted-foreground">
                            {hasSubsections
                              ? "content in subsections"
                              : "no text captured"}
                          </span>
                        </span>
                      </div>
                    </li>
                  );
                }
                return (
                  <li key={section.id}>
                    <details className="group rounded-lg border border-border">
                      <summary
                        className="cursor-pointer select-none list-none rounded-lg px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden"
                        style={{
                          paddingLeft: `${1 + (section.level > 0 ? section.level - 1 : 0) * 1.25}rem`,
                        }}
                      >
                        <span className="flex items-center justify-between gap-3">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <ChevronRight
                              className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
                              aria-hidden
                            />
                            <span className="truncate">{section.heading}</span>
                          </span>
                          <span className="flex shrink-0 items-center gap-1 text-xs font-normal text-muted-foreground">
                            <AlignLeft className="size-3.5" aria-hidden />
                            {section.paragraphs.length}
                            <span className="sr-only">paragraphs</span>
                          </span>
                        </span>
                      </summary>
                      <Separator />
                      {/* Content aligns under the heading text (base padding +
                    chevron width + gap), so hierarchy reads in the body too. */}
                      <div
                        className="flex flex-col gap-3 py-3 pr-4"
                        style={{
                          paddingLeft: `${2.375 + (section.level > 0 ? section.level - 1 : 0) * 1.25}rem`,
                        }}
                      >
                        {section.paragraphs.map((p, i) =>
                          isMarkdownTable(p) ? (
                            <MarkdownTable
                              key={`${section.id}-${i}`}
                              markdown={p}
                            />
                          ) : isTableDebris(p) ? (
                            <p
                              key={`${section.id}-${i}`}
                              title="Table or figure data from the PDF layout; tables have no text structure in PDFs."
                              className="rounded-md bg-muted/50 px-2 py-1 font-mono text-xs leading-relaxed text-muted-foreground/70"
                            >
                              {p}
                            </p>
                          ) : (
                            <p
                              key={`${section.id}-${i}`}
                              className="text-sm leading-relaxed text-muted-foreground"
                            >
                              {renderParagraph(p)}
                            </p>
                          ),
                        )}
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
          </section>

          <CitationsTable doc={doc} />

          <section aria-labelledby="raw-refs-heading">
            <h2
              id="raw-refs-heading"
              className="mb-3 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground"
            >
              <FileText className="size-4" aria-hidden />
              Raw reference region
              {doc.references.heading && ` "${doc.references.heading}"`}
              {doc.references.startPage > 0 &&
                `, page ${doc.references.startPage}`}
            </h2>
            <InlineIssues failures={issuesFor(doc.failures, "references")} />
            {doc.references.rawLines.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No reference list located.
              </p>
            ) : (
              <details className="group rounded-lg border border-border">
                <summary className="flex cursor-pointer select-none items-center gap-1.5 list-none rounded-lg px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                  <ChevronRight
                    className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
                    aria-hidden
                  />
                  {doc.references.rawLines.length} raw lines
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    (as extracted, before segmentation)
                  </span>
                </summary>
                <Separator />
                <ol className="flex flex-col gap-1 px-4 py-3 font-mono text-xs leading-relaxed text-muted-foreground">
                  {doc.references.rawLines.map((line, i) => (
                    <li key={`ref-${i}`}>{line}</li>
                  ))}
                </ol>
              </details>
            )}
          </section>
        </div>
        <SourcePdfPane paperId={doc.id} filename={doc.meta.filename} />
      </div>
    </SourcePdfProvider>
  );
}
