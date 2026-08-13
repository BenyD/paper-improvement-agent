import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { PaperDocument, ReferenceEntry } from "@/lib/doc/types";
import { structured } from "../client";
import { CLAIM_CHECK } from "../instructions";
import { sentenceAt, stripSupTokens } from "./context";
import type { Finding, ReviewStats } from "./types";

export interface CitedClaim {
  refId: string;
  markerId: string;
  sectionId: string;
  sentence: string;
}

const MAX_CLAIMS_PER_REF = 3;

/**
 * Deterministic prep: for every reference entry, collect the sentences that
 * cite it (via the linked markers). One LLM call per entry then judges all of
 * its claims against the entry's real abstract.
 */
export function collectClaims(doc: PaperDocument): Map<string, CitedClaim[]> {
  const byRef = new Map<string, CitedClaim[]>();
  const sectionById = new Map(doc.sections.map((s) => [s.id, s]));

  for (const marker of doc.citations.markers) {
    const section = sectionById.get(marker.sectionId);
    const paragraph = section?.paragraphs[marker.paragraph];
    if (!paragraph) continue;
    const sentence = stripSupTokens(
      sentenceAt(paragraph, marker.offset),
    ).trim();
    if (sentence.length < 20) continue;

    for (const refId of marker.targets) {
      const list = byRef.get(refId) ?? [];
      if (list.length >= MAX_CLAIMS_PER_REF) continue;
      if (list.some((c) => c.sentence === sentence)) continue;
      list.push({
        refId,
        markerId: marker.id,
        sectionId: marker.sectionId,
        sentence,
      });
      byRef.set(refId, list);
    }
  }
  return byRef;
}

const VerdictSchema = z.object({
  assessments: z.array(
    z.object({
      claimIndex: z.number().int().min(0),
      verdict: z.enum([
        "supports",
        "partially-supports",
        "does-not-support",
        "cannot-tell",
      ]),
      confidence: z.enum(["high", "medium", "low"]),
      explanation: z.string(),
    }),
  ),
});

export async function checkClaimsForEntry(
  entry: ReferenceEntry,
  claims: CitedClaim[],
): Promise<{ findings: Finding[]; supported: number; checked: number }> {
  const abstract = entry.csl.abstract;
  if (!abstract || claims.length === 0)
    return { findings: [], supported: 0, checked: 0 };

  const user = [
    `Cited work: "${entry.csl.title ?? entry.rawText.slice(0, 100)}"`,
    `Abstract:\n${abstract.slice(0, 2500)}`,
    "",
    "Sentences citing this work:",
    ...claims.map((c, i) => `${i}. ${c.sentence}`),
  ].join("\n");

  const result = await structured({
    system: CLAIM_CHECK,
    user,
    toolName: "report_assessments",
    description: "Report one assessment per cited sentence.",
    schema: VerdictSchema,
  });

  const findings: Finding[] = [];
  let supported = 0;

  for (const a of result.assessments) {
    const claim = claims[a.claimIndex];
    if (!claim) continue;
    if (a.verdict === "supports") {
      supported++;
      continue;
    }
    if (a.verdict === "cannot-tell") continue; // counted, not alarmed

    findings.push({
      id: randomUUID(),
      kind: "claim-mismatch",
      severity: a.verdict === "does-not-support" ? "high" : "medium",
      confidence: a.confidence,
      sectionId: claim.sectionId,
      markerId: claim.markerId,
      refId: entry.id,
      summary:
        a.verdict === "does-not-support"
          ? `Cited source does not support this claim`
          : `Claim overstates what the cited source shows`,
      detail: `"${claim.sentence}"\n\n${a.explanation}`,
      source: {
        title: entry.csl.title ?? entry.rawText.slice(0, 80),
        url: entry.resolution.url ?? entry.csl.URL ?? "",
        year: entry.csl.issued?.["date-parts"]?.[0]?.[0],
        authors: (entry.csl.author ?? [])
          .slice(0, 3)
          .map((x) => x.family ?? x.literal ?? "")
          .join(", "),
      },
    });
  }

  return { findings, supported, checked: result.assessments.length };
}

/** Entries eligible for claim checking: cited, verified, with an abstract. */
export function checkableEntries(
  doc: PaperDocument,
  claims: Map<string, CitedClaim[]>,
): ReferenceEntry[] {
  return doc.citations.entries.filter(
    (e) =>
      claims.has(e.id) &&
      e.resolution.status === "verified" &&
      Boolean(e.csl.abstract),
  );
}

export function emptyStats(): ReviewStats {
  return {
    sectionsScanned: 0,
    queriesRun: 0,
    candidatesConsidered: 0,
    entriesChecked: 0,
    claimsChecked: 0,
    claimsSupported: 0,
    skippedNoAbstract: 0,
  };
}
