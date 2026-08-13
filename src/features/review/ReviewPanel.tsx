"use client";

import { CircleCheck, Loader2, ScanSearch } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  Finding,
  ReviewEvent,
  ReviewResult,
} from "@/lib/agent/review/types";
import { FindingCard } from "./FindingCard";

type Phase = "idle" | "running" | "done" | "error";

export function ReviewPanel({
  paperId,
  initialReview,
}: {
  paperId: string;
  initialReview: ReviewResult | null;
}) {
  const [phase, setPhase] = useState<Phase>(initialReview ? "done" : "idle");
  const [findings, setFindings] = useState<Finding[]>(
    initialReview?.findings ?? [],
  );
  const [result, setResult] = useState<ReviewResult | null>(initialReview);
  const [progress, setProgress] = useState<string>("");

  const start = useCallback(() => {
    setPhase("running");
    setFindings([]);
    setResult(null);
    setProgress("Starting review…");

    const es = new EventSource(`/api/papers/${paperId}/review`);
    es.onmessage = (msg) => {
      const ev = JSON.parse(msg.data) as ReviewEvent;
      if (ev.type === "progress") setProgress(ev.message);
      if (ev.type === "finding") setFindings((prev) => [...prev, ev.finding]);
      if (ev.type === "error")
        toast.error("Review error", { description: ev.message });
      if (ev.type === "done") {
        setResult(ev.result);
        setPhase("done");
        es.close();
      }
    };
    es.onerror = async () => {
      es.close();
      setPhase((p) => (p === "running" ? "error" : p));
      // A 503 (missing key) arrives as a failed EventSource — fetch the reason.
      try {
        const res = await fetch(`/api/papers/${paperId}/review`, {
          headers: { Accept: "application/json" },
        });
        if (!res.ok) {
          const json = (await res.json()) as { error?: string };
          if (json.error)
            toast.error("Review unavailable", { description: json.error });
        }
      } catch {
        toast.error("Review stream failed", {
          description: "Check the server and try again.",
        });
      }
    };
  }, [paperId]);

  const mismatches = findings.filter((f) => f.kind === "claim-mismatch");
  const missing = findings.filter((f) => f.kind === "missing-work");

  return (
    <section aria-label="Peer review">
      {phase === "idle" && (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border px-6 py-14 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <ScanSearch className="size-5 text-muted-foreground" aria-hidden />
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium">No review yet</p>
            <p className="max-w-xs text-sm text-muted-foreground">
              Searches OpenAlex and Semantic Scholar for relevant work the paper
              does not cite, and checks whether cited sources actually support
              the claims attached to them.
            </p>
          </div>
          <Button onClick={start}>
            <ScanSearch aria-hidden /> Run peer review
          </Button>
        </div>
      )}

      {phase === "error" && (
        <div className="mb-3 flex justify-end">
          <Button onClick={start} variant="outline" size="sm">
            <ScanSearch aria-hidden /> Try again
          </Button>
        </div>
      )}

      {/* Live region: progress + incoming findings are announced politely. */}
      <output aria-live="polite" className="block">
        {phase === "running" && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">{progress}</p>
            {findings.length === 0 ? (
              <div className="flex flex-col gap-3" aria-hidden>
                <Skeleton className="h-24 w-full rounded-xl" />
                <Skeleton className="h-24 w-full rounded-xl" />
                <Skeleton className="h-24 w-2/3 rounded-xl" />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                {findings.length} finding{findings.length === 1 ? "" : "s"} so
                far…
              </p>
            )}
          </div>
        )}
      </output>

      {(phase === "done" || findings.length > 0) && (
        <div className="flex flex-col gap-6">
          {result && (
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {result.stats.sectionsScanned} sections scanned,{" "}
                {result.stats.queriesRun} searches,{" "}
                {result.stats.candidatesConsidered} candidates considered.{" "}
                {result.stats.claimsChecked} claims checked against{" "}
                {result.stats.entriesChecked} abstracts (
                {result.stats.claimsSupported} supported
                {result.stats.mismatchesWithdrawn > 0 &&
                  `, ${result.stats.mismatchesWithdrawn} accusations withdrawn after adversarial re-check`}
                {result.stats.skippedNoAbstract > 0 &&
                  `, ${result.stats.skippedNoAbstract} entries skipped for lack of an abstract`}
                ). Model: {result.model}
              </p>
              <Button
                onClick={start}
                variant="outline"
                size="sm"
                disabled={phase === "running"}
                className="shrink-0"
              >
                {phase === "running" ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <ScanSearch aria-hidden />
                )}
                Run again
              </Button>
            </div>
          )}

          <FindingGroup
            title={`Claim-citation mismatches (${mismatches.length})`}
            findings={mismatches}
            empty="Every checked claim was supported by its cited source."
          />
          <FindingGroup
            title={`Possibly missing citations (${missing.length})`}
            findings={missing}
            empty="No missing work found beyond the existing references."
          />

          {result && result.notes.length > 0 && (
            <details className="rounded-lg border border-border">
              <summary className="cursor-pointer select-none rounded-lg px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                Process notes ({result.notes.length}): skips, empty searches,
                errors
              </summary>
              <Separator />
              <ul className="flex flex-col gap-1 px-4 py-3 text-xs text-muted-foreground">
                {result.notes.map((note, i) => (
                  <li key={`note-${i}`}>{note}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}

function FindingGroup({
  title,
  findings,
  empty,
}: {
  title: string;
  findings: Finding[];
  empty: string;
}) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      {findings.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CircleCheck
            className="size-4 shrink-0 text-(--success)"
            aria-hidden
          />
          {empty}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {findings.map((f) => (
            <li key={f.id}>
              <FindingCard finding={f} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
