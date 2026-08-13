"use client";

import { ExternalLink, FileText, X } from "lucide-react";
import { createContext, useContext, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Overleaf-style split: the parsed document stays the editable surface on
 * the left, and the originally uploaded PDF renders as a sticky reference
 * column on the right (stacked below on small screens). Context lets the
 * header toggle and the pane live in different branches of the layout.
 */
const SourcePdfContext = createContext<{
  open: boolean;
  toggle: () => void;
} | null>(null);

export function SourcePdfProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <SourcePdfContext.Provider
      value={{ open, toggle: () => setOpen((o) => !o) }}
    >
      {children}
    </SourcePdfContext.Provider>
  );
}

export function SourcePdfToggle() {
  const ctx = useContext(SourcePdfContext);
  if (!ctx) return null;
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={ctx.toggle}
      aria-expanded={ctx.open}
    >
      <FileText aria-hidden />
      {ctx.open ? "Hide source PDF" : "Source PDF"}
    </Button>
  );
}

export function SourcePdfPane({
  paperId,
  filename,
}: {
  paperId: string;
  filename: string;
}) {
  const ctx = useContext(SourcePdfContext);
  if (!ctx?.open) return null;
  return (
    <div className="w-full border-t border-border p-3 lg:sticky lg:top-0 lg:h-dvh lg:w-1/2 lg:shrink-0 lg:border-t-0 lg:border-l">
      <div className="flex h-[70vh] flex-col gap-1.5 lg:h-full">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Source PDF
          </span>
          <div className="flex items-center gap-3">
            <a
              href={`/api/papers/${paperId}/pdf`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Open in a new tab
              <ExternalLink className="size-3" aria-hidden />
            </a>
            <button
              type="button"
              onClick={ctx.toggle}
              aria-label="Hide source PDF"
              className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </div>
        </div>
        {/* Chrome PDF-viewer open parameters: no toolbar, no side panes,
            zoom to page width — the pane is for reading, not managing. */}
        <iframe
          title={`Original PDF: ${filename}`}
          src={`/api/papers/${paperId}/pdf#toolbar=0&navpanes=0&view=FitH`}
          className="w-full flex-1 border border-border bg-muted"
        />
      </div>
    </div>
  );
}
