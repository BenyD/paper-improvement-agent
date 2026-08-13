import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { PaperDocument } from "@/lib/doc/types";
import { CitationsTable } from "./CitationsTable";
import { FailuresPanel } from "./FailuresPanel";

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
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-6 sm:px-8">
      <FailuresPanel failures={doc.failures} />

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
          className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground"
        >
          Structure ({doc.sections.length} sections)
        </h2>
        <ul className="flex flex-col gap-1">
          {doc.sections.map((section) => (
            <li key={section.id}>
              <details className="group rounded-lg border border-border">
                <summary
                  className="cursor-pointer select-none rounded-lg px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  style={{
                    paddingLeft: `${1 + (section.level > 0 ? section.level - 1 : 0) * 1.25}rem`,
                  }}
                >
                  {section.heading}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {section.paragraphs.length} ¶
                  </span>
                </summary>
                <Separator />
                <div className="flex flex-col gap-3 px-4 py-3">
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
          className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground"
        >
          Raw reference region
          {doc.references.heading && ` "${doc.references.heading}"`}, page{" "}
          {doc.references.startPage}
        </h2>
        {doc.references.rawLines.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No reference list located.
          </p>
        ) : (
          <details className="rounded-lg border border-border">
            <summary className="cursor-pointer select-none rounded-lg px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
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
