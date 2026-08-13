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
export async function runReview(
  doc: PaperDocument,
  emit: (ev: ReviewEvent) => void,
  signal?: AbortSignal,
): Promise<ReviewResult> {
  const result: ReviewResult = {
    id: randomUUID(),
    paperId: doc.id,
    model: modelId(),
    startedAt: new Date().toISOString(),
    findings: [],
    notes: [],
    stats: emptyStats(),
  };

  const addFinding = (f: ReviewResult["findings"][number]) => {
    result.findings.push(f);
    emit({ type: "finding", finding: f });
  };

  // ---- Missing work ----
  try {
    const sections = reviewableSections(doc);
    result.stats.sectionsScanned = sections.length;
    emit({
      type: "progress",
      message: `Scanning ${sections.length} sections for missing citations...`,
    });

    const queries = await generateQueries(doc, sections);
    result.stats.queriesRun = queries.length;

    const bySection = new Map<string, string[]>();
    for (const q of queries) {
      bySection.set(q.sectionId, [
        ...(bySection.get(q.sectionId) ?? []),
        q.query,
      ]);
    }

    for (const section of sections) {
      if (signal?.aborted) break;
      const sectionQueries = bySection.get(section.sectionId) ?? [];
      if (sectionQueries.length === 0) continue;
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
        continue;
      }

      const findings = await judgeCandidates(doc, section, candidates);
      if (findings.length === 0) {
        result.notes.push(
          `"${section.heading}": ${candidates.length} candidates considered, none judged relevant.`,
        );
      }
      for (const f of findings) addFinding(f);
    }
  } catch (err) {
    const message = `Missing-work review failed: ${err instanceof Error ? err.message : String(err)}`;
    result.notes.push(message);
    emit({ type: "error", message });
  }

  // ---- Claim / citation match ----
  try {
    const claims = collectClaims(doc);
    const entries = checkableEntries(doc, claims);
    const skipped = [...claims.keys()].filter(
      (refId) => !entries.some((e) => e.id === refId),
    );
    result.stats.skippedNoAbstract = skipped.length;
    if (skipped.length > 0) {
      result.notes.push(
        `${skipped.length} cited entr${skipped.length === 1 ? "y" : "ies"} skipped claim-checking (no verified abstract available) — honesty over guessing.`,
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

  if (signal?.aborted)
    result.notes.push("Review aborted by the client; results are partial.");
  result.finishedAt = new Date().toISOString();
  emit({ type: "done", result });
  return result;
}
