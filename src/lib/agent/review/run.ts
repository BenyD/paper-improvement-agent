import { randomUUID } from "node:crypto";
import type { PaperDocument } from "@/lib/doc/types";
import { modelId } from "../client";
import {
  checkableEntries,
  checkClaimsForEntry,
  collectClaims,
  emptyStats,
} from "./claims";
import { reviewableSections } from "./context";
import {
  dedupeCandidates,
  generateQueries,
  judgeCandidates,
  searchCandidates,
} from "./missing";
import type { ReviewEvent, ReviewResult } from "./types";

/**
 * The peer-review workflow — an orchestrated, predictable pipeline
 * (Anthropic's "workflow" pattern, not a free-roaming agent):
 *
 *   1. Pick reviewable sections (deterministic).
 *   2. One LLM call proposes search queries per section.
 *   3. Search OpenAlex + Semantic Scholar (real APIs, cached).
 *   4. Deterministic dedupe against the paper's existing references.
 *   5. One LLM call per section judges candidate relevance → findings.
 *   6. Claim checking: per cited entry with a real abstract, one LLM call
 *      judges every citing sentence against that abstract → findings.
 *
 * Every finding carries a real, linkable source. Failures and empty results
 * are emitted as notes. Findings stream to the caller as they are produced.
 */
export interface RunReviewOptions {
  /** A checkpointed partial result from an interrupted run; resume skips
   *  its `completed` work units instead of re-spending tokens. */
  prior?: ReviewResult | null;
  /** Called after each completed work unit with the current (partial)
   *  result, so an interrupt loses at most one unit of work. */
  checkpoint?: (result: ReviewResult) => Promise<void>;
}

export async function runReview(
  doc: PaperDocument,
  emit: (ev: ReviewEvent) => void,
  signal?: AbortSignal,
  opts?: RunReviewOptions,
): Promise<ReviewResult> {
  const prior = opts?.prior?.partial ? opts.prior : undefined;
  const result: ReviewResult = prior ?? {
    id: randomUUID(),
    paperId: doc.id,
    model: modelId(),
    startedAt: new Date().toISOString(),
    findings: [],
    notes: [],
    stats: emptyStats(),
  };
  result.partial = true;
  result.completed ??= { sections: [], entries: [] };
  const completed = result.completed;

  // Serialize checkpoint writes so concurrent claim workers never interleave
  // two half-written review.json files.
  let checkpointChain = Promise.resolve();
  const checkpoint = () => {
    checkpointChain = checkpointChain
      .then(() => opts?.checkpoint?.(result))
      .catch(() => {});
    return checkpointChain;
  };
  await checkpoint();

  const addFinding = (f: ReviewResult["findings"][number]) => {
    result.findings.push(f);
    emit({ type: "finding", finding: f });
  };

  if (prior) {
    emit({
      type: "progress",
      message: `Resuming interrupted review (${prior.findings.length} finding${prior.findings.length === 1 ? "" : "s"} restored)...`,
    });
    // Replay checkpointed findings so the client rebuilds the full list
    // without any model calls.
    for (const f of prior.findings) emit({ type: "finding", finding: f });
  }

  // ---- Missing work ----
  try {
    const sections = reviewableSections(doc);
    result.stats.sectionsScanned = sections.length;
    const pending = sections.filter(
      (s) => !completed.sections.includes(s.sectionId),
    );
    if (pending.length < sections.length) {
      result.notes.push(
        `Resume: skipped ${sections.length - pending.length} already-scanned section(s).`,
      );
    }
    emit({
      type: "progress",
      message: `Scanning ${pending.length} sections for missing citations...`,
    });

    const queries =
      pending.length > 0 ? await generateQueries(doc, pending) : [];
    result.stats.queriesRun += queries.length;

    const bySection = new Map<string, string[]>();
    for (const q of queries) {
      bySection.set(q.sectionId, [
        ...(bySection.get(q.sectionId) ?? []),
        q.query,
      ]);
    }

    for (const section of pending) {
      if (signal?.aborted) break;
      const sectionQueries = bySection.get(section.sectionId) ?? [];
      if (sectionQueries.length === 0) {
        completed.sections.push(section.sectionId);
        continue;
      }
      emit({
        type: "progress",
        message: `Searching for work related to "${section.heading}"...`,
      });

      const raw: Awaited<ReturnType<typeof searchCandidates>>["items"] = [];
      for (const query of sectionQueries) {
        const { items, notes } = await searchCandidates(query, doc.meta.year);
        raw.push(...items);
        result.notes.push(...notes);
      }

      const candidates = dedupeCandidates(raw, doc).slice(0, 8);
      result.stats.candidatesConsidered += candidates.length;
      if (candidates.length === 0) {
        result.notes.push(
          `"${section.heading}": search returned nothing new beyond the existing references.`,
        );
        completed.sections.push(section.sectionId);
        await checkpoint();
        continue;
      }

      const findings = await judgeCandidates(doc, section, candidates);
      if (findings.length === 0) {
        result.notes.push(
          `"${section.heading}": ${candidates.length} candidates considered, none judged relevant.`,
        );
      }
      for (const f of findings) addFinding(f);
      completed.sections.push(section.sectionId);
      await checkpoint();
    }
  } catch (err) {
    const message = `Missing-work review failed: ${err instanceof Error ? err.message : String(err)}`;
    result.notes.push(message);
    emit({ type: "error", message });
  }

  // ---- Claim / citation match ----
  try {
    const claims = collectClaims(doc);
    const allEntries = checkableEntries(doc, claims);
    const entries = allEntries.filter((e) => !completed.entries.includes(e.id));
    if (entries.length < allEntries.length) {
      result.notes.push(
        `Resume: skipped ${allEntries.length - entries.length} already-checked entr${allEntries.length - entries.length === 1 ? "y" : "ies"}.`,
      );
    }
    const skipped = [...claims.keys()].filter(
      (refId) => !allEntries.some((e) => e.id === refId),
    );
    result.stats.skippedNoAbstract = skipped.length;
    if (skipped.length > 0 && !prior) {
      result.notes.push(
        `${skipped.length} cited entr${skipped.length === 1 ? "y" : "ies"} skipped claim-checking (no verified abstract available): honesty over guessing.`,
      );
    }

    emit({
      type: "progress",
      message: `Checking claims against ${entries.length} cited abstracts...`,
    });

    const CONCURRENCY = 4;
    let next = 0;
    const worker = async () => {
      while (next < entries.length) {
        if (signal?.aborted) return;
        const entry = entries[next++];
        const entryClaims = claims.get(entry.id) ?? [];
        try {
          const { findings, supported, checked, withdrawn } =
            await checkClaimsForEntry(entry, entryClaims);
          result.stats.entriesChecked++;
          result.stats.claimsChecked += checked;
          result.stats.claimsSupported += supported;
          result.stats.mismatchesWithdrawn += withdrawn;
          for (const f of findings) addFinding(f);
          // Failed entries stay unmarked so the next resume retries them.
          completed.entries.push(entry.id);
          await checkpoint();
        } catch (err) {
          result.notes.push(
            `Claim check failed for "${entry.csl.title ?? entry.id}": ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, entries.length) }, worker),
    );
  } catch (err) {
    const message = `Claim checking failed: ${err instanceof Error ? err.message : String(err)}`;
    result.notes.push(message);
    emit({ type: "error", message });
  }

  if (signal?.aborted) {
    result.notes.push(
      "Review interrupted by the client; a checkpoint was saved and the next run resumes from it.",
    );
  } else {
    result.partial = false;
  }
  result.finishedAt = new Date().toISOString();
  await checkpoint();
  emit({ type: "done", result });
  return result;
}
