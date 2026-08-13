"use client";

import { useCallback, useState } from "react";
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
    setProgress("Starting review...");

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
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Peer review
        </h2>
        <button
          type="button"
          onClick={start}
          disabled={phase === "running"}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          {phase === "running"
            ? "Reviewing..."
            : result
              ? "Run again"
              : "Run peer review"}
        </button>
      </div>

      {phase === "idle" && (
        <p className="text-sm text-neutral-500">
          Searches OpenAlex and Semantic Scholar for relevant work the paper
          does not cite, and checks whether cited sources actually support the
          claims attached to them.
        </p>
      )}

      {phase === "running" && (
        <p className="animate-pulse text-sm text-neutral-600 dark:text-neutral-400">
          {progress}
        </p>
      )}

      {error && (
        <p className="mt-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {error}
        </p>
      )}

      {(phase === "done" || findings.length > 0) && (
        <div className="mt-2 flex flex-col gap-6">
          {result && (
            <p className="text-xs text-neutral-500">
              {result.stats.sectionsScanned} sections scanned ·{" "}
              {result.stats.queriesRun} searches ·{" "}
              {result.stats.candidatesConsidered} candidates considered ·{" "}
              {result.stats.claimsChecked} claims checked against{" "}
              {result.stats.entriesChecked} abstracts (
              {result.stats.claimsSupported} supported
              {result.stats.skippedNoAbstract > 0 &&
                `, ${result.stats.skippedNoAbstract} entries skipped — no abstract`}
              ) · model {result.model}
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
            <details className="rounded-lg border border-neutral-200 dark:border-neutral-800">
              <summary className="cursor-pointer select-none px-4 py-2.5 text-sm font-medium text-neutral-500 hover:bg-neutral-50 dark:hover:bg-neutral-900">
                Process notes ({result.notes.length}) — skips, empty searches,
                errors
              </summary>
              <ul className="flex flex-col gap-1 border-t border-neutral-100 px-4 py-3 text-xs text-neutral-500 dark:border-neutral-800">
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
        <p className="text-sm text-neutral-500">{empty}</p>
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
