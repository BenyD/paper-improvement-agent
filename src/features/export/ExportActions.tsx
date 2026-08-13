import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PaperDocument } from "@/lib/doc/types";

/** Compact header actions: LaTeX and BibTeX downloads (rendered via CSL). */
export function ExportActions({ doc }: { doc: PaperDocument }) {
  return (
    <div className="flex gap-2">
      <Button
        variant="outline"
        size="sm"
        nativeButton={false}
        render={<a href={`/api/papers/${doc.id}/export?format=tex`} download />}
      >
        <Download aria-hidden /> .tex
      </Button>
      <Button
        variant="outline"
        size="sm"
        nativeButton={false}
        render={<a href={`/api/papers/${doc.id}/export?format=bib`} download />}
      >
        <Download aria-hidden /> .bib
      </Button>
    </div>
  );
}
