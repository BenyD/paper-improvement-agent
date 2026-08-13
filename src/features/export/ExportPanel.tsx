import type { PaperDocument } from "@/lib/doc/types";

export function ExportPanel({ doc }: { doc: PaperDocument }) {
  const button =
    "rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900";
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
        Export
      </h2>
      <p className="mb-3 text-sm text-neutral-500">
        Rebuilds the paper as LaTeX — structure, approved edits, and all{" "}
        {doc.citations.entries.length} references survive the round trip; the
        bibliography is rendered through CSL (citeproc), not string templates.
      </p>
      <div className="flex gap-2">
        <a
          href={`/api/papers/${doc.id}/export?format=tex`}
          className={button}
          download
        >
          Download .tex
        </a>
        <a
          href={`/api/papers/${doc.id}/export?format=bib`}
          className={button}
          download
        >
          Download .bib
        </a>
      </div>
    </section>
  );
}
