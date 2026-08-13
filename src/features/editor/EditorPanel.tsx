"use client";

import { ArrowUp, Check, MessageSquareText, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { EditProposal } from "@/lib/doc/ops";
import type { PaperDocument } from "@/lib/doc/types";
import { cn } from "@/lib/utils";
import { OpView } from "./DiffView";

/**
 * Chat-style editing: commands and outcomes read as a conversation. Past
 * proposals seed the thread; a new command appends a user bubble, a thinking
 * indicator, then the proposal card (approve/reject inline) or the agent's
 * text reply.
 */

type ChatItem =
  | { kind: "user"; text: string }
  | { kind: "agent-text"; text: string }
  | { kind: "agent-proposal"; proposal: EditProposal }
  | { kind: "thinking" };

const STATUS_BADGE: Record<
  EditProposal["status"],
  "default" | "secondary" | "destructive"
> = {
  approved: "default",
  proposed: "secondary",
  rejected: "destructive",
};

function threadFromHistory(proposals: EditProposal[]): ChatItem[] {
  // History arrives newest-first; the thread reads oldest-first.
  return [...proposals].reverse().flatMap((p): ChatItem[] => [
    { kind: "user", text: p.command },
    { kind: "agent-proposal", proposal: p },
  ]);
}

export function EditorPanel({
  doc,
  pastProposals,
}: {
  doc: PaperDocument;
  pastProposals: EditProposal[];
}) {
  const router = useRouter();
  const [thread, setThread] = useState<ChatItem[]>(() =>
    threadFromHistory(pastProposals),
  );
  const [command, setCommand] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on every thread change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [thread]);

  const send = async () => {
    const text = command.trim();
    if (text.length < 4 || busy) return;
    setBusy(true);
    setCommand("");
    setThread((t) => [...t, { kind: "user", text }, { kind: "thinking" }]);

    try {
      const res = await fetch(`/api/papers/${doc.id}/edits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: text }),
      });
      const json = (await res.json()) as {
        proposal?: EditProposal;
        message?: string;
        error?: string;
      };
      setThread((t) => {
        const withoutThinking = t.filter((i) => i.kind !== "thinking");
        if (json.proposal)
          return [
            ...withoutThinking,
            { kind: "agent-proposal", proposal: json.proposal },
          ];
        return [
          ...withoutThinking,
          {
            kind: "agent-text",
            text:
              json.message ?? json.error ?? `Request failed (${res.status}).`,
          },
        ];
      });
      if (json.error) toast.error("Edit failed", { description: json.error });
    } catch (err) {
      setThread((t) => t.filter((i) => i.kind !== "thinking"));
      toast.error("Edit failed", {
        description: err instanceof Error ? err.message : "Request failed.",
      });
    } finally {
      setBusy(false);
    }
  };

  const decide = async (
    proposal: EditProposal,
    action: "approve" | "reject",
  ) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/papers/${doc.id}/edits/${proposal.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        violations?: string[];
      };
      if (!json.ok) {
        toast.error("Could not apply the edit", {
          description: [json.error, ...(json.violations ?? [])]
            .filter(Boolean)
            .join(" "),
        });
        return;
      }
      const status = action === "approve" ? "approved" : "rejected";
      setThread((t) =>
        t.map((i) =>
          i.kind === "agent-proposal" && i.proposal.id === proposal.id
            ? { kind: "agent-proposal", proposal: { ...i.proposal, status } }
            : i,
        ),
      );
      if (action === "approve") {
        toast.success("Edit applied", {
          description:
            "The document now reflects the change. Citations intact.",
        });
      } else {
        toast.info("Proposal rejected", {
          description: "No changes were made to the document.",
        });
      }
      router.refresh();
    } catch (err) {
      toast.error("Decision failed", {
        description: err instanceof Error ? err.message : "Request failed.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="relative flex-1 overflow-y-auto px-4 py-4">
        {thread.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <MessageSquareText
                className="size-5 text-muted-foreground"
                aria-hidden
              />
            </div>
            <p className="text-sm font-medium">Edit by instruction</p>
            <p className="max-w-xs text-sm text-muted-foreground">
              Try "make the introduction more concise" or "add a supporting
              citation to the methodology". Every change is validated and shown
              as a diff before you approve it.
            </p>
          </div>
        )}
        <ul className="flex flex-col gap-3">
          {thread.map((item, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: append-only thread
            <li key={i} className="flex flex-col">
              {item.kind === "user" && (
                <div className="max-w-[85%] self-end rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-sm text-primary-foreground">
                  {item.text}
                </div>
              )}
              {item.kind === "agent-text" && (
                <div className="max-w-[95%] self-start rounded-2xl rounded-bl-md bg-muted px-3.5 py-2 text-sm">
                  {item.text}
                </div>
              )}
              {item.kind === "thinking" && (
                <output
                  aria-live="polite"
                  aria-label="The agent is working"
                  className="self-start px-1 py-0.5"
                >
                  {/* Claude-style shimmer: a light band sweeps the label. */}
                  <span className="animate-[text-shimmer_2s_linear_infinite] bg-[linear-gradient(90deg,var(--color-muted-foreground)_35%,var(--color-foreground)_50%,var(--color-muted-foreground)_65%)] bg-[length:200%_100%] bg-clip-text text-sm text-transparent motion-reduce:animate-none">
                    Reading the paper, searching if needed…
                  </span>
                </output>
              )}
              {item.kind === "agent-proposal" && (
                <Card className="gap-0 self-stretch py-0">
                  <CardHeader className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium">
                        {item.proposal.summary}
                      </p>
                      <Badge
                        variant={STATUS_BADGE[item.proposal.status]}
                        className="shrink-0 capitalize"
                      >
                        {item.proposal.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {item.proposal.ops.length} operation
                      {item.proposal.ops.length === 1 ? "" : "s"}, validated (no
                      citations lost)
                    </p>
                  </CardHeader>
                  <Separator />
                  <CardContent className="flex flex-col gap-4 px-4 py-4">
                    {item.proposal.ops.map((op, j) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: static proposal render
                      <OpView key={j} op={op} doc={doc} />
                    ))}
                  </CardContent>
                  {item.proposal.status === "proposed" && (
                    <>
                      <Separator />
                      <CardFooter className="gap-2 px-4 py-3">
                        <Button
                          size="sm"
                          onClick={() => void decide(item.proposal, "approve")}
                          disabled={busy}
                          className="bg-(--success)/15 text-(--success) hover:bg-(--success)/25"
                        >
                          <Check aria-hidden /> Approve
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => void decide(item.proposal, "reject")}
                          disabled={busy}
                          className="bg-destructive/10 text-destructive hover:bg-destructive/20"
                        >
                          <X aria-hidden /> Reject
                        </Button>
                      </CardFooter>
                    </>
                  )}
                </Card>
              )}
            </li>
          ))}
        </ul>
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 border-t border-border p-3">
        <form
          className={cn(
            "flex items-end gap-2 rounded-2xl border border-border bg-background p-1.5 pl-3.5 transition-shadow",
            "focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30",
          )}
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <textarea
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={1}
            placeholder="Describe an edit…"
            aria-label="Editing instruction"
            disabled={busy}
            className="max-h-32 min-h-8 flex-1 resize-none bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground"
          />
          <Button
            type="submit"
            size="icon"
            aria-label="Send instruction"
            disabled={busy || command.trim().length < 4}
            className="rounded-full transition-transform active:scale-[0.96]"
          >
            <ArrowUp aria-hidden />
          </Button>
        </form>
      </div>
    </div>
  );
}
