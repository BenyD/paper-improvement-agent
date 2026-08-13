"use client";

import { PenLine, ScanSearch } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EditorPanel } from "@/features/editor/EditorPanel";
import { ReviewPanel } from "@/features/review/ReviewPanel";
import type { ReviewResult } from "@/lib/agent/review/types";
import type { EditProposal } from "@/lib/doc/ops";
import type { PaperDocument } from "@/lib/doc/types";

/** The right-hand assistant rail: peer review and editing, tabbed. */
export function AssistantTabs({
  doc,
  review,
  proposals,
}: {
  doc: PaperDocument;
  review: ReviewResult | null;
  proposals: EditProposal[];
}) {
  return (
    <Tabs defaultValue="review" className="flex h-full flex-col gap-0">
      <div className="border-b border-border px-4 py-2">
        <TabsList className="w-full">
          <TabsTrigger value="review" className="flex-1">
            <ScanSearch aria-hidden /> Peer review
          </TabsTrigger>
          <TabsTrigger value="edit" className="flex-1">
            <PenLine aria-hidden /> Edit
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="review" className="flex-1 overflow-y-auto p-4">
        <ReviewPanel paperId={doc.id} initialReview={review} />
      </TabsContent>
      <TabsContent value="edit" className="min-h-0 flex-1">
        <EditorPanel doc={doc} pastProposals={proposals} />
      </TabsContent>
    </Tabs>
  );
}
