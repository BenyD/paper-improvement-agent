import type { Metadata } from "next";
import { notFound } from "next/navigation";
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
    <div className="flex flex-col lg:h-dvh lg:flex-row">
      {/* relative: scroll containers must be containing blocks, or absolutely
          positioned descendants (e.g. Tailwind sr-only) escape the overflow
          clip and stretch the page past h-dvh */}
      <main className="relative min-w-0 flex-1 lg:overflow-y-auto">
        <ParseView doc={doc} />
      </main>
      <aside
        aria-label="Review and editing assistant"
        className="flex min-h-[70dvh] w-full flex-col border-t border-border lg:min-h-0 lg:h-dvh lg:w-[30rem] lg:shrink-0 lg:border-t-0 lg:border-l"
      >
        <AssistantTabs doc={doc} review={review} proposals={proposals} />
      </aside>
    </div>
  );
}
