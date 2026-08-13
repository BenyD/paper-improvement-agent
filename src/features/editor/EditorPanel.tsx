"use client";

import { ArrowUp, Check, Maximize2, MessageSquareText, X } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  | { kind: "thinking"; status: string };

const STATUS_BADGE: Record<EditProposal["status"], string> = {
  proposed: "bg-(--info)/10 text-(--info)",
  approved: "bg-(--success)/10 text-(--success)",
  rejected: "bg-destructive/10 text-destructive",
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
  draftCommand,
}: {
  doc: PaperDocument;
  pastProposals: EditProposal[];
  draftCommand?: string | null;
}) {
  const router = useRouter();
  const [thread, setThread] = useState<ChatItem[]>(() =>
    threadFromHistory(pastProposals),
  );
  const [command, setCommand] = useState("");
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState<EditProposal | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on every thread change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [thread]);

  // A review finding's "Fix in editor" prefills the composer for approval.
  useEffect(() => {
    if (draftCommand) setCommand(draftCommand);
  }, [draftCommand]);

  const send = async () => {
    const text = command.trim();
    if (text.length < 4 || busy) return;
    setBusy(true);
    setCommand("");
    setThread((t) => [
      ...t,
      { kind: "user", text },
      { kind: "thinking", status: "Reading the paper…" },
    ]);

    const setStatus = (status: string) =>
      setThread((t) =>
        t.map((i) => (i.kind === "thinking" ? { ...i, status } : i)),
      );
    const finish = (item: ChatItem | null) =>
      setThread((t) => {
        const withoutThinking = t.filter((i) => i.kind !== "thinking");
        return item ? [...withoutThinking, item] : withoutThinking;
      });

    try {
      const res = await fetch(`/api/papers/${doc.id}/edits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: text }),
      });
      if (!res.ok || !res.body) {
        const json = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        finish(null);
        toast.error("Edit failed", {
          description: json?.error ?? `Request failed (${res.status}).`,
        });
        return;
      }

      // Parse the SSE stream: progress events update the live status line,
      // done/error events end the turn.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let ended = false;
      while (!ended) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const data = frame.replace(/^data: /, "").trim();
          if (!data) continue;
          const ev = JSON.parse(data) as {
            type: "progress" | "done" | "error";
            message?: string;
            proposal?: EditProposal;
            failed?: boolean;
          };
          if (ev.type === "progress" && ev.message) setStatus(ev.message);
          if (ev.type === "done") {
            ended = true;
            if (ev.proposal)
              finish({ kind: "agent-proposal", proposal: ev.proposal });
            else
              finish({
                kind: "agent-text",
                text: ev.message ?? "The agent finished without a proposal.",
              });
          }
          if (ev.type === "error") {
            ended = true;
            finish(null);
            toast.error("Edit failed", { description: ev.message });
          }
        }
      }
      if (!ended) finish(null);
    } catch (err) {
      finish(null);
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
                  {/* Claude-style shimmer over the agent's live status. */}
                  <span className="animate-[text-shimmer_2s_linear_infinite] bg-[linear-gradient(90deg,var(--color-muted-foreground)_35%,var(--color-foreground)_50%,var(--color-muted-foreground)_65%)] bg-[length:200%_100%] bg-clip-text text-sm text-transparent motion-reduce:animate-none">
                    {item.status}
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
                        className={cn(
                          "shrink-0 capitalize",
                          STATUS_BADGE[item.proposal.status],
                        )}
                      >
                        {item.proposal.status === "approved" && (
                          <Check aria-hidden />
                        )}
                        {item.proposal.status === "rejected" && (
                          <X aria-hidden />
                        )}
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
                  <Separator />
                  <CardFooter className="gap-2 px-4 py-3">
                    {item.proposal.status === "proposed" && (
                      <>
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
                      </>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setReviewing(item.proposal)}
                      className="ml-auto text-muted-foreground"
                    >
                      <Maximize2 aria-hidden />
                      {item.proposal.status === "proposed"
                        ? "Review changes"
                        : "View changes"}
                    </Button>
                  </CardFooter>
                </Card>
              )}
            </li>
          ))}
        </ul>
        <div ref={bottomRef} />
      </div>

      <Dialog
        open={reviewing !== null}
        onOpenChange={(open) => !open && setReviewing(null)}
      >
        <DialogContent className="flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-2xl">
          {reviewing && (
            <>
              <DialogHeader className="border-b border-border px-5 py-4">
                <DialogTitle className="pr-6 text-base leading-snug">
                  Review proposed changes
                </DialogTitle>
                <p className="text-sm text-muted-foreground">
                  {reviewing.summary}
                </p>
                <p className="text-xs text-muted-foreground">
                  {reviewing.ops.length} operation
                  {reviewing.ops.length === 1 ? "" : "s"}, validated (no
                  citations lost)
                </p>
              </DialogHeader>
              <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
                {reviewing.ops.map((op, j) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: static proposal render
                  <OpView key={j} op={op} doc={doc} />
                ))}
              </div>
              <div className="flex items-center gap-2 border-t border-border px-5 py-3">
                {reviewing.status === "proposed" ? (
                  <>
                    <Button
                      onClick={() =>
                        void decide(reviewing, "approve").then(() =>
                          setReviewing(null),
                        )
                      }
                      disabled={busy}
                      className="bg-(--success)/15 text-(--success) hover:bg-(--success)/25"
                    >
                      <Check aria-hidden /> Approve
                    </Button>
                    <Button
                      onClick={() =>
                        void decide(reviewing, "reject").then(() =>
                          setReviewing(null),
                        )
                      }
                      disabled={busy}
                      className="bg-destructive/10 text-destructive hover:bg-destructive/20"
                    >
                      <X aria-hidden /> Reject
                    </Button>
                  </>
                ) : (
                  <Badge
                    className={cn("capitalize", STATUS_BADGE[reviewing.status])}
                  >
                    {reviewing.status === "approved" && <Check aria-hidden />}
                    {reviewing.status === "rejected" && <X aria-hidden />}
                    {reviewing.status}
                  </Badge>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

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
