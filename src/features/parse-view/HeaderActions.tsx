"use client";

import { ExternalLink, FileText } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ExportActions } from "@/features/export/ExportActions";
import type { PaperDocument } from "@/lib/doc/types";

/**
 * Header action group plus the live source-PDF pane. The pane is a sibling
 * flex item with `basis-full`, so inside the header's flex-wrap row it drops
 * to its own full-width line below the actions — the original page renders
 * next to the parse for spot-checking the parser against ground truth.
 */
export function HeaderActions({ doc }: { doc: PaperDocument }) {
  const [showPdf, setShowPdf] = useState(false);
  return (
    <>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowPdf((s) => !s)}
          aria-expanded={showPdf}
        >
          <FileText aria-hidden />
          {showPdf ? "Hide source PDF" : "Source PDF"}
        </Button>
        <ExportActions doc={doc} />
      </div>
      {showPdf && (
        <div className="order-last flex basis-full flex-col gap-1.5">
          <a
            href={`/api/papers/${doc.id}/pdf`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 self-end text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Open in a new tab
            <ExternalLink className="size-3" aria-hidden />
          </a>
          <iframe
            title={`Original PDF: ${doc.meta.filename}`}
            src={`/api/papers/${doc.id}/pdf`}
            className="h-[75vh] w-full rounded-xl border border-border bg-muted"
          />
        </div>
      )}
    </>
  );
}
