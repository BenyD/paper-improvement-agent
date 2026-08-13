import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExportActions } from "@/features/export/ExportActions";
import { ParseView } from "@/features/parse-view/ParseView";
import { AssistantTabs } from "@/features/workspace/AssistantTabs";
import { listProposals, loadPaper, loadReview } from "@/lib/storage/papers";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const doc = await loadPaper(id);
  return { title: doc?.title || "Paper" };
}

export default async function PaperPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const doc = await loadPaper(id);
  if (!doc) notFound();
  const review = await loadReview(id);
  const proposals = await listProposals(id);

  return (
    <div className="flex flex-col lg:h-dvh">
      <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-3 sm:px-6">
        <Link
          href="/"
          aria-label="Back to upload"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="size-4" aria-hidden />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold">
            {doc.title || "(no title detected)"}
          </h1>
          <p className="truncate text-xs text-muted-foreground">
            {doc.meta.filename}, {doc.meta.pageCount} pages, {doc.meta.layout}
            {doc.meta.year && `, ${doc.meta.year}`}
          </p>
        </div>
        <ExportActions doc={doc} />
      </header>

      <div className="flex flex-1 flex-col lg:min-h-0 lg:flex-row">
        <main className="min-w-0 flex-1 lg:overflow-y-auto">
          <ParseView doc={doc} />
        </main>
        <aside
          aria-label="Review and editing assistant"
          className="flex min-h-[60dvh] w-full flex-col border-t border-border lg:min-h-0 lg:w-[30rem] lg:shrink-0 lg:border-t-0 lg:border-l"
        >
          <AssistantTabs doc={doc} review={review} proposals={proposals} />
        </aside>
      </div>
    </div>
  );
}
