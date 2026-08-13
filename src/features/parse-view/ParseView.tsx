import {
  AlignLeft,
  ArrowLeft,
  ChevronRight,
  FileText,
  ListTree,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ExportActions } from "@/features/export/ExportActions";
import type { PaperDocument } from "@/lib/doc/types";
import { CitationsTable } from "./CitationsTable";
import { InlineIssues, issuesFor } from "./InlineIssues";

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
    <div className="flex w-full flex-col gap-8 px-4 py-6 sm:px-8 lg:px-10">
      <header className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="size-4" aria-hidden />
            All papers
          </Link>
          <ExportActions doc={doc} />
        </div>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-semibold leading-snug tracking-tight sm:text-3xl">
            {doc.title || "(no title detected)"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {doc.meta.filename}, {doc.meta.pageCount} pages, {doc.meta.layout}
            {doc.meta.year && `, ${doc.meta.year}`}
          </p>
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
        <h2
          id="structure-heading"
          className="mb-3 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground"
        >
          <ListTree className="size-4" aria-hidden />
          Structure ({doc.sections.length} sections)
        </h2>
        <InlineIssues failures={issuesFor(doc.failures, "structure")} />
        <ul className="flex flex-col gap-1">
          {doc.sections.map((section) => (
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
                  {section.paragraphs.map((p, i) => (
                    <p
                      key={`${section.id}-${i}`}
                      className="text-sm leading-relaxed text-muted-foreground"
                    >
                      {renderParagraph(p)}
                    </p>
                  ))}
                </div>
              </details>
            </li>
          ))}
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
          {doc.references.startPage > 0 && `, page ${doc.references.startPage}`}
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
  );
}
