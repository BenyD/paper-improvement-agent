import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PaperDocument } from "@/lib/doc/types";

export function ExportPanel({ doc }: { doc: PaperDocument }) {
  return (
    <section aria-labelledby="export-heading">
      <h2
        id="export-heading"
        className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground"
      >
        Export
      </h2>
      <p className="mb-3 text-sm text-muted-foreground">
        Rebuilds the paper as LaTeX. Structure, approved edits, and all{" "}
        {doc.citations.entries.length} references survive the round trip, with
        the bibliography rendered through CSL (citeproc), not string templates.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          render={
            <a href={`/api/papers/${doc.id}/export?format=tex`} download />
          }
        >
          <Download aria-hidden /> Download .tex
        </Button>
        <Button
          variant="outline"
          render={
            <a href={`/api/papers/${doc.id}/export?format=bib`} download />
          }
        >
          <Download aria-hidden /> Download .bib
        </Button>
      </div>
    </section>
  );
}
