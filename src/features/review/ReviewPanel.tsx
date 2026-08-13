"use client";

import {
  CircleAlert,
  CircleCheck,
  Info,
  Loader2,
  ScanSearch,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
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
  onFix,
}: {
  paperId: string;
  initialReview: ReviewResult | null;
  onFix?: (command: string) => void;
}) {
  const [phase, setPhase] = useState<Phase>(initialReview ? "done" : "idle");
  const [findings, setFindings] = useState<Finding[]>(
    initialReview?.findings ?? [],
  );
  const [result, setResult] = useState<ReviewResult | null>(initialReview);
  const [progress, setProgress] = useState<string>("");
  const [activity, setActivity] = useState<string>("");
  const esRef = useRef<EventSource | null>(null);

  // Close the stream if the panel unmounts mid-run (e.g. a router refresh
  // from an approved edit) — the server checkpoints, so nothing is lost and
  // the remounted panel shows a resumable state instead of a zombie run.
  useEffect(() => () => esRef.current?.close(), []);

  // A server refresh can deliver a fresher saved review than our local state
  // (finished after a remount, healed by a resume elsewhere). Adopt it unless
  // a run is streaming right now. The identity guard prevents update loops.
  useEffect(() => {
    if (!initialReview || phase === "running") return;
    const newer =
      !result ||
      result.id !== initialReview.id ||
      result.partial !== initialReview.partial ||
      result.findings.length !== initialReview.findings.length;
    if (newer) {
      setResult(initialReview);
      setFindings(initialReview.findings);
      setPhase("done");
    }
  }, [initialReview, phase, result]);

  const start = useCallback(() => {
    setPhase("running");
    setFindings([]);
    setResult(null);
    setProgress("Starting review…");

    const es = new EventSource(`/api/papers/${paperId}/review`);
    esRef.current = es;
    es.onmessage = (msg) => {
      const ev = JSON.parse(msg.data) as ReviewEvent;
      if (ev.type === "progress") {
        setProgress(ev.message);
        setActivity("");
      }
      if (ev.type === "activity") setActivity(ev.message);
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
  const rateLimitedCount =
    result?.notes.filter((n) => /rate.?limit|429/i.test(n)).length ?? 0;

  return (
    <section aria-label="Peer review" className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {phase === "idle" && (
          <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border px-6 py-14 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <ScanSearch
                className="size-5 text-muted-foreground"
                aria-hidden
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-medium">No review yet</p>
              <p className="max-w-xs text-sm text-muted-foreground">
                Searches OpenAlex and Semantic Scholar for relevant work the
                paper does not cite, and checks whether cited sources actually
                support the claims attached to them.
              </p>
            </div>
            <Button onClick={start}>
              <ScanSearch aria-hidden /> Run peer review
            </Button>
          </div>
        )}

        {phase === "error" && (
          <div className="mb-3 flex justify-end">
            <Button onClick={start} size="sm">
              <ScanSearch aria-hidden /> Try again
            </Button>
          </div>
        )}

        {/* Live region: progress + incoming findings are announced politely. */}
        <output aria-live="polite" className="block">
          {phase === "running" && (
            <div className="mb-4 flex flex-col gap-4">
              {/* Echoes the idle empty state's icon disc, so pressing the
                button reads as the same surface coming alive. */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                    <ScanSearch
                      className="size-4 animate-pulse text-muted-foreground"
                      aria-hidden
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">{progress}</p>
                </div>
                {activity && (
                  <p className="pl-[2.625rem] text-xs text-muted-foreground/70">
                    {activity}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-3" aria-hidden>
                {findings.length === 0 ? (
                  <>
                    <FindingSkeleton />
                    <FindingSkeleton />
                    <FindingSkeleton short />
                  </>
                ) : (
                  <FindingSkeleton short />
                )}
              </div>
            </div>
          )}
        </output>

        {(phase === "done" || findings.length > 0) && (
          <div className="flex flex-col gap-6">
            {result?.partial && phase !== "running" && (
              <p className="flex items-center gap-2 rounded-lg bg-(--warning)/10 px-3 py-2 text-xs text-(--warning)">
                <CircleAlert className="size-3.5 shrink-0" aria-hidden />
                This review was interrupted before finishing. Resuming picks up
                from the saved checkpoint without re-checking finished work.
              </p>
            )}
            {result && rateLimitedCount >= 4 && phase !== "running" && (
              <p className="flex items-start gap-2 rounded-lg bg-(--warning)/10 px-3 py-2 text-xs leading-relaxed text-(--warning)">
                <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>
                  {rateLimitedCount} literature searches were rate-limited by
                  the academic APIs, so missing-work coverage is partial.
                  Running again later fills the gap; claim checks were
                  unaffected.
                </span>
              </p>
            )}
            {result && (
              <p className="flex items-start gap-2 rounded-lg bg-(--info)/10 px-3 py-2 text-xs leading-relaxed text-(--info)">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>
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
                  ).
                </span>
              </p>
            )}

            <FindingGroup
              title={`Claim-citation mismatches (${mismatches.length})`}
              findings={mismatches}
              empty="Every checked claim was supported by its cited source."
              onFix={onFix}
            />
            <FindingGroup
              title={`Possibly missing citations (${missing.length})`}
              findings={missing}
              empty="No missing work found beyond the existing references."
              onFix={onFix}
            />

            {result && result.notes.length > 0 && (
              <details className="rounded-lg border border-border">
                <summary className="cursor-pointer select-none rounded-lg px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  Process notes ({result.notes.length}): skips, empty searches,
                  errors
                </summary>
                <Separator />
                <ul className="flex flex-col divide-y divide-border/60">
                  {result.notes.map((note, i) => (
                    <li
                      key={`note-${i}`}
                      className="flex items-start gap-2 px-4 py-2 text-xs leading-relaxed text-muted-foreground"
                    >
                      {/(failed|error|rate-limited|aborted|interrupted)/i.test(
                        note,
                      ) ? (
                        <CircleAlert
                          className="mt-0.5 size-3.5 shrink-0 text-(--warning)"
                          aria-hidden
                        />
                      ) : (
                        <Info
                          className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/60"
                          aria-hidden
                        />
                      )}
                      <span>{note}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </div>

      {result && (
        <div className="shrink-0 border-t border-border p-3">
          <Button
            onClick={start}
            disabled={phase === "running"}
            className="w-full"
          >
            {phase === "running" ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <ScanSearch aria-hidden />
            )}
            {result.partial ? "Resume review" : "Run again"}
          </Button>
        </div>
      )}
    </section>
  );
}

/** Placeholder shaped like a FindingCard: title + badges, then detail lines. */
function FindingSkeleton({ short }: { short?: boolean }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-border p-4">
      <div className="flex items-center gap-2">
        <Skeleton className="h-3.5 w-36" />
        <Skeleton className="h-5 w-20 rounded-4xl" />
        <Skeleton className="h-5 w-24 rounded-4xl" />
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className={short ? "h-3 w-1/2" : "h-3 w-5/6"} />
    </div>
  );
}

function FindingGroup({
  title,
  findings,
  empty,
  onFix,
}: {
  title: string;
  findings: Finding[];
  empty: string;
  onFix?: (command: string) => void;
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
              <FindingCard finding={f} onFix={onFix} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
