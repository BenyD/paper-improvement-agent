"use client";

import { Loader2 } from "lucide-react";
import { useCallback, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  const [error, setError] = useState<string>("");

  const start = useCallback(() => {
    setPhase("running");
    setFindings([]);
    setResult(null);
    setError("");
    setProgress("Starting review…");

    const es = new EventSource(`/api/papers/${paperId}/review`);
    es.onmessage = (msg) => {
      const ev = JSON.parse(msg.data) as ReviewEvent;
      if (ev.type === "progress") setProgress(ev.message);
      if (ev.type === "finding") setFindings((prev) => [...prev, ev.finding]);
      if (ev.type === "error") setError(ev.message);
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
          if (json.error) setError(json.error);
        }
      } catch {
        setError((e) => e || "Review stream failed.");
      }
    };
  }, [paperId]);

  const mismatches = findings.filter((f) => f.kind === "claim-mismatch");
  const missing = findings.filter((f) => f.kind === "missing-work");

  return (
    <section aria-labelledby="review-heading">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2
          id="review-heading"
          className="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
        >
          Peer review
        </h2>
        <Button onClick={start} disabled={phase === "running"}>
          {phase === "running" && (
            <Loader2 className="animate-spin" aria-hidden />
          )}
          {phase === "running"
            ? "Reviewing…"
            : result
              ? "Run again"
              : "Run peer review"}
        </Button>
      </div>

      {phase === "idle" && (
        <p className="text-sm text-muted-foreground">
          Searches OpenAlex and Semantic Scholar for relevant work the paper
          does not cite, and checks whether cited sources actually support the
          claims attached to them.
        </p>
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

      {error && (
        <Alert variant="destructive" className="mt-2">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {(phase === "done" || findings.length > 0) && (
        <div className="mt-2 flex flex-col gap-6">
          {result && (
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
        <p className="text-sm text-muted-foreground">{empty}</p>
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
