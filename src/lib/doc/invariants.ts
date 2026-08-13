import { applyOps, type EditOp } from "./ops";
import type { PaperDocument } from "./types";

export type ValidationResult =
  | { ok: true; after: PaperDocument }
  | { ok: false; violations: string[] };

/**
 * THE non-negotiable, as code. The LLM proposes ops; this validator decides.
 * It is not a prompt, cannot be argued with, and runs both at proposal time
 * and again at approval time (the document may have changed in between).
 *
 * Rules:
 *  1. Structural sanity — every op targets an existing section/paragraph.
 *  2. New references must be verified against a real source (no unverified
 *     source can ever be ADDED by an edit).
 *  3. Citation preservation — after applying the ops and re-linking markers
 *     (the same P6 linker the parser uses), every reference that was cited
 *     before must still be cited somewhere. No edit can silently orphan a
 *     reference; explicit removal is not an operation this system offers.
 *  4. No fabricated citations — the edited text must not contain markers that
 *     resolve to nothing (e.g. "[99]" with 40 references).
 */
export function validateOps(
  doc: PaperDocument,
  ops: EditOp[],
): ValidationResult {
  const violations: string[] = [];
  const sectionById = new Map(doc.sections.map((s) => [s.id, s]));

  if (ops.length === 0) violations.push("The proposal contains no operations.");

  const touched = new Set<string>();
  for (const op of ops) {
    if (op.type === "add_reference") {
      if (op.resolution.status !== "verified" || !op.resolution.url) {
        violations.push(
          `add_reference "${op.csl.title ?? "untitled"}": only sources verified against OpenAlex/Semantic Scholar can be added.`,
        );
      }
      continue;
    }
    const section = sectionById.get(op.sectionId);
    if (!section) {
      violations.push(`${op.type}: section "${op.sectionId}" does not exist.`);
      continue;
    }
    if (op.type === "edit_heading") continue;
    const index =
      op.type === "insert_paragraph" ? op.afterParagraph : op.paragraph;
    const min = op.type === "insert_paragraph" ? -1 : 0;
    if (index < min || index >= section.paragraphs.length) {
      violations.push(
        `${op.type}: paragraph ${index} is out of range for section "${section.heading}" (${section.paragraphs.length} paragraphs).`,
      );
    }
    if (op.type !== "insert_paragraph") {
      const key = `${op.sectionId}:${index}`;
      if (op.type === "replace_paragraph" || op.type === "delete_paragraph") {
        if (touched.has(key))
          violations.push(`Conflicting operations target ${key}.`);
        touched.add(key);
      }
    }
  }

  if (violations.length > 0) return { ok: false, violations };

  const after = applyOps(doc, ops);

  // Rule 3: citation preservation (set semantics — no reference loses its
  // last remaining in-text citation).
  const citedBefore = new Set(doc.citations.markers.flatMap((m) => m.targets));
  const citedAfter = new Set(after.citations.markers.flatMap((m) => m.targets));
  for (const refId of citedBefore) {
    if (!citedAfter.has(refId)) {
      const entry = doc.citations.entries.find((e) => e.id === refId);
      violations.push(
        `Citation lost: "${entry?.csl.title ?? refId}" (${refId}) was cited before this edit and would not be cited anywhere after it.`,
      );
    }
  }

  // Rule 4: no fabricated markers.
  const unresolvedBefore = countUnresolved(doc);
  const unresolvedAfter = countUnresolved(after);
  if (unresolvedAfter > unresolvedBefore) {
    violations.push(
      `The edited text cites ${unresolvedAfter - unresolvedBefore} marker(s) that match no reference entry — citations must point at real entries.`,
    );
  }

  // Reference entries must never disappear.
  const entryIdsBefore = new Set(doc.citations.entries.map((e) => e.id));
  for (const id of entryIdsBefore) {
    if (!after.citations.entries.some((e) => e.id === id)) {
      violations.push(
        `Reference entry ${id} disappeared — entries can never be removed by an edit.`,
      );
    }
  }

  return violations.length > 0
    ? { ok: false, violations }
    : { ok: true, after };
}

function countUnresolved(doc: PaperDocument): number {
  return doc.citations.markers.reduce((n, m) => n + m.unresolved.length, 0);
}
