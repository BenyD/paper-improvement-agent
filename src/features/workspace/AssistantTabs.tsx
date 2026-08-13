"use client";

import { PenLine, ScanSearch } from "lucide-react";
import { useState } from "react";
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
  // "Fix in editor" on a review finding jumps here: switch tab, prefill.
  const [tab, setTab] = useState("review");
  const [draftCommand, setDraftCommand] = useState<string | null>(null);

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => setTab(v as string)}
      className="flex h-full flex-col gap-0"
    >
      {/* pt matches the document pane's top padding so the tab bar centers
          with the All papers / Source PDF / Export row across the split. */}
      <div className="border-b border-border px-4 pt-[22px] pb-2">
        <TabsList className="w-full">
          <TabsTrigger value="review" className="flex-1">
            <ScanSearch aria-hidden /> Peer review
          </TabsTrigger>
          <TabsTrigger value="edit" className="flex-1">
            <PenLine aria-hidden /> Edit
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="review" className="min-h-0 flex-1">
        <ReviewPanel
          paperId={doc.id}
          initialReview={review}
          onFix={(command) => {
            setDraftCommand(command);
            setTab("edit");
          }}
        />
      </TabsContent>
      <TabsContent value="edit" className="min-h-0 flex-1">
        <EditorPanel
          doc={doc}
          pastProposals={proposals}
          draftCommand={draftCommand}
        />
      </TabsContent>
    </Tabs>
  );
}
