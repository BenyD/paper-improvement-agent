import Link from "next/link";
import { notFound } from "next/navigation";
import { EditorPanel } from "@/features/editor/EditorPanel";
import { ExportPanel } from "@/features/export/ExportPanel";
import { ParseView } from "@/features/parse-view/ParseView";
import { ReviewPanel } from "@/features/review/ReviewPanel";
import { listProposals, loadPaper, loadReview } from "@/lib/storage/papers";

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
    <main className="min-h-screen">
      <nav className="border-b border-neutral-200 px-6 py-3 dark:border-neutral-800">
        <Link
          href="/"
          className="text-sm text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
        >
          ← Upload another paper
        </Link>
      </nav>
      <ParseView doc={doc}>
        <ReviewPanel paperId={doc.id} initialReview={review} />
        <EditorPanel doc={doc} pastProposals={proposals} />
        <ExportPanel doc={doc} />
      </ParseView>
    </main>
  );
}
