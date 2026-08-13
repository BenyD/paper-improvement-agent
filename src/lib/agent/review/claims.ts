import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { PaperDocument, ReferenceEntry } from "@/lib/doc/types";
import { structured } from "../client";
import { CLAIM_CHECK, VERIFY_MISMATCH } from "../instructions";
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
    // Formula-mangled text produces junk "sentences" (and even fake bracket
    // markers like "√[1]") — not judgeable claims, skip them.
    if (isMathNoise(sentence)) continue;

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

const MATH_CHARS = /[√∑∏∫≈≤≥±×÷∈∀∃∇∂∞·∗‖|=+^_{}\\]/g;

/** True when a sentence is dominated by formula debris rather than prose. */
export function isMathNoise(sentence: string): boolean {
  const mathHits = (sentence.match(MATH_CHARS) ?? []).length;
  const words = sentence.split(/\s+/);
  const shortTokens = words.filter((w) => w.length <= 2).length;
  return (
    mathHits >= 3 ||
    mathHits / sentence.length > 0.02 ||
    shortTokens / words.length > 0.5
  );
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
      /** Verbatim excerpt from the abstract evidencing the verdict. */
      quote: z.string().optional(),
    }),
  ),
});

const VerifySchema = z.object({
  verdict: z.enum(["survives", "withdrawn"]),
  reason: z.string(),
});

/** Whitespace/case-insensitive containment — is the quote really verbatim? */
export function quoteInText(quote: string, text: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  const q = norm(quote);
  return q.length >= 10 && norm(text).includes(q);
}

export async function checkClaimsForEntry(
  entry: ReferenceEntry,
  claims: CitedClaim[],
): Promise<{
  findings: Finding[];
  supported: number;
  checked: number;
  withdrawn: number;
}> {
  const abstract = entry.csl.abstract;
  if (!abstract || claims.length === 0)
    return { findings: [], supported: 0, checked: 0, withdrawn: 0 };

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
  let withdrawn = 0;

  for (const a of result.assessments) {
    const claim = claims[a.claimIndex];
    if (!claim) continue;
    if (a.verdict === "supports") {
      supported++;
      continue;
    }
    if (a.verdict === "cannot-tell") continue; // counted, not alarmed

    // Adversarial verification: a "does-not-support" accusation must survive
    // the strongest opposing reading before it ships as a high-severity
    // finding (DeepSciVerify-style escalation; kills judge false positives).
    if (a.verdict === "does-not-support") {
      const check = await structured({
        system: VERIFY_MISMATCH,
        user: [
          `Abstract:\n${abstract.slice(0, 2500)}`,
          "",
          `Sentence citing this work: ${claim.sentence}`,
          `Reviewer's accusation: ${a.explanation}`,
        ].join("\n"),
        toolName: "judge_accusation",
        description:
          "Decide whether the accusation survives the strongest opposing case.",
        schema: VerifySchema,
        maxTokens: 800,
      });
      if (check.verdict === "withdrawn") {
        withdrawn++;
        continue;
      }
    }

    // Code-enforced evidence grounding: the quote must actually appear in the
    // abstract, or the finding is demoted to low confidence.
    const quoteValid = a.quote ? quoteInText(a.quote, abstract) : false;
    const confidence = quoteValid ? a.confidence : "low";
    const evidence = quoteValid ? `\n\nAbstract evidence: "${a.quote}"` : "";

    findings.push({
      id: randomUUID(),
      kind: "claim-mismatch",
      severity: a.verdict === "does-not-support" ? "high" : "medium",
      confidence,
      sectionId: claim.sectionId,
      markerId: claim.markerId,
      refId: entry.id,
      summary:
        a.verdict === "does-not-support"
          ? `Cited source does not support this claim`
          : `Claim overstates what the cited source shows`,
      detail: `"${claim.sentence}"\n\n${a.explanation}${evidence}`,
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

  return { findings, supported, checked: result.assessments.length, withdrawn };
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
    mismatchesWithdrawn: 0,
  };
}
