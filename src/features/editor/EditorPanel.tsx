"use client";

import { Check, Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import type { EditProposal } from "@/lib/doc/ops";
import type { PaperDocument } from "@/lib/doc/types";
import { OpView } from "./DiffView";

type Phase = "idle" | "thinking" | "reviewing" | "deciding";

const STATUS_BADGE: Record<
  EditProposal["status"],
  "default" | "secondary" | "destructive"
> = {
  approved: "default",
  proposed: "secondary",
  rejected: "destructive",
};

export function EditorPanel({
  doc,
  pastProposals,
}: {
  doc: PaperDocument;
  pastProposals: EditProposal[];
}) {
  const router = useRouter();
  const [command, setCommand] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [proposal, setProposal] = useState<EditProposal | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const propose = async () => {
    setPhase("thinking");
    setError("");
    setMessage("");
    setProposal(null);
    try {
      const res = await fetch(`/api/papers/${doc.id}/edits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command }),
      });
      const json = (await res.json()) as {
        proposal?: EditProposal;
        message?: string;
        error?: string;
      };
      if (json.proposal) {
        setProposal(json.proposal);
        setPhase("reviewing");
      } else if (json.message) {
        setMessage(json.message);
        setPhase("idle");
      } else {
        setError(json.error ?? `Request failed (${res.status}).`);
        setPhase("idle");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
      setPhase("idle");
    }
  };

  const decide = async (action: "approve" | "reject") => {
    if (!proposal) return;
    setPhase("deciding");
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
        setError(
          [json.error, ...(json.violations ?? [])].filter(Boolean).join(" "),
        );
        setPhase("reviewing");
        return;
      }
      setProposal(null);
      setCommand("");
      setMessage(
        action === "approve"
          ? "Edit applied. The document below reflects the change."
          : "Proposal rejected.",
      );
      setPhase("idle");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Decision failed.");
      setPhase("reviewing");
    }
  };

  return (
    <section aria-labelledby="editor-heading">
      <h2
        id="editor-heading"
        className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground"
      >
        Edit by instruction
      </h2>

      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (command.trim().length >= 4 && phase === "idle") void propose();
        }}
      >
        <Input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder='e.g. "make the introduction more concise"'
          aria-label="Editing instruction"
          disabled={phase === "thinking"}
        />
        <Button
          type="submit"
          disabled={phase === "thinking" || command.trim().length < 4}
          className="shrink-0"
        >
          {phase === "thinking" && (
            <Loader2 className="animate-spin" aria-hidden />
          )}
          {phase === "thinking" ? "Working…" : "Propose edit"}
        </Button>
      </form>

      <output aria-live="polite" className="block">
        {phase === "thinking" && (
          <div className="mt-3 flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">
              The agent is reading the paper, searching for sources if needed,
              and drafting a validated proposal…
            </p>
            <div aria-hidden className="flex flex-col gap-2">
              <Skeleton className="h-5 w-3/4 rounded" />
              <Skeleton className="h-20 w-full rounded-xl" />
            </div>
          </div>
        )}
        {message && (
          <p className="mt-3 rounded-lg bg-muted px-4 py-3 text-sm">
            {message}
          </p>
        )}
      </output>

      {error && (
        <Alert variant="destructive" className="mt-3">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {proposal && (
        <Card className="mt-4 gap-0 py-0">
          <CardHeader className="px-4 py-3">
            <p className="text-sm font-medium">{proposal.summary}</p>
            <p className="text-xs text-muted-foreground">
              {proposal.ops.length} operation
              {proposal.ops.length === 1 ? "" : "s"} · validated: no citations
              lost · model {proposal.model}
            </p>
          </CardHeader>
          <Separator />
          <CardContent className="flex flex-col gap-4 px-4 py-4">
            {proposal.ops.map((op, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static proposal render
              <OpView key={i} op={op} doc={doc} />
            ))}
          </CardContent>
          <Separator />
          <CardFooter className="gap-2 px-4 py-3">
            <Button
              onClick={() => void decide("approve")}
              disabled={phase === "deciding"}
              className="bg-emerald-600 text-white hover:bg-emerald-500"
            >
              <Check aria-hidden /> Approve &amp; apply
            </Button>
            <Button
              variant="outline"
              onClick={() => void decide("reject")}
              disabled={phase === "deciding"}
            >
              <X aria-hidden /> Reject
            </Button>
          </CardFooter>
        </Card>
      )}

      {pastProposals.length > 0 && (
        <details className="mt-4 rounded-lg border border-border">
          <summary className="cursor-pointer select-none rounded-lg px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Edit history ({pastProposals.length})
          </summary>
          <Separator />
          <ul className="flex flex-col gap-2 px-4 py-3">
            {pastProposals.map((p) => (
              <li key={p.id} className="text-sm">
                <Badge variant={STATUS_BADGE[p.status]} className="mr-2">
                  {p.status}
                </Badge>
                <span className="font-medium">"{p.command}"</span>
                <span className="text-muted-foreground"> — {p.summary}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
