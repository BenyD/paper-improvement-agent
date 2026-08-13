import type { CslItem } from "../csl/types";
import { linkMarkers } from "../parse/markers";
import type { Resolution } from "../sources/resolve";
import type { PaperDocument, ReferenceEntry } from "./types";

/**
 * The only ways the agent can change a paper. Citations are not a separate
 * op: citation markers live inline in paragraph text ("[41]", "(Smith, 2020)")
 * and the invariant validator re-links them after every op set — so a citation
 * cannot be silently lost by any combination of text edits.
 */
export type EditOp =
  | {
      type: "replace_paragraph";
      sectionId: string;
      paragraph: number;
      text: string;
    }
  | {
      type: "insert_paragraph";
      sectionId: string;
      afterParagraph: number;
      text: string;
    }
  | { type: "delete_paragraph"; sectionId: string; paragraph: number }
  | { type: "edit_heading"; sectionId: string; heading: string }
  /** Add a NEW reference — only from a search result the loop itself saw. */
  | { type: "add_reference"; csl: CslItem; resolution: Resolution };

export interface EditProposal {
  id: string;
  paperId: string;
  command: string;
  summary: string;
  ops: EditOp[];
  createdAt: string;
  status: "proposed" | "approved" | "rejected";
  model: string;
}

/** Pure structural application; markers are rebuilt via P6 afterwards. */
export function applyOps(doc: PaperDocument, ops: EditOp[]): PaperDocument {
  const sections = doc.sections.map((s) => ({
    ...s,
    paragraphs: [...s.paragraphs],
  }));
  const byId = new Map(sections.map((s) => [s.id, s]));
  const entries: ReferenceEntry[] = [...doc.citations.entries];

  // Text ops address ORIGINAL paragraph indices; stage mutations, then rebuild.
  type Staged = { replaced?: string; deleted?: boolean; inserts: string[] };
  const staged = new Map<string, Map<number, Staged>>();
  const stagedFor = (sectionId: string, index: number): Staged => {
    if (!staged.has(sectionId)) staged.set(sectionId, new Map());
    const bySection = staged.get(sectionId) as Map<number, Staged>;
    if (!bySection.has(index)) bySection.set(index, { inserts: [] });
    return bySection.get(index) as Staged;
  };

  for (const op of ops) {
    switch (op.type) {
      case "replace_paragraph":
        stagedFor(op.sectionId, op.paragraph).replaced = op.text;
        break;
      case "delete_paragraph":
        stagedFor(op.sectionId, op.paragraph).deleted = true;
        break;
      case "insert_paragraph":
        stagedFor(op.sectionId, op.afterParagraph).inserts.push(op.text);
        break;
      case "edit_heading": {
        const section = byId.get(op.sectionId);
        if (section) section.heading = op.heading;
        break;
      }
      case "add_reference": {
        const nextNumber = entries.length + 1;
        const usesNumbers =
          doc.citations.entryStyle === "bracket" ||
          doc.citations.entryStyle === "number-dot";
        const id = `ref-${usesNumbers ? nextNumber : `new-${nextNumber}`}`;
        entries.push({
          id,
          marker: usesNumbers ? String(nextNumber) : null,
          rawText: `(added) ${op.csl.title ?? ""}`,
          csl: { ...op.csl, id },
          resolution: op.resolution,
        });
        break;
      }
    }
  }

  for (const section of sections) {
    const bySection = staged.get(section.id);
    if (!bySection) continue;
    const out: string[] = [];
    const startInserts = bySection.get(-1)?.inserts ?? [];
    out.push(...startInserts);
    section.paragraphs.forEach((original, i) => {
      const change = bySection.get(i);
      if (!change) {
        out.push(original);
        return;
      }
      if (!change.deleted) out.push(change.replaced ?? original);
      out.push(...change.inserts);
    });
    section.paragraphs = out;
  }

  const linked = linkMarkers(
    sections,
    entries.map((e) => ({
      id: e.id,
      marker: e.marker,
      csl: e.csl,
      rawText: e.rawText,
    })),
  );

  return {
    ...doc,
    sections,
    citations: {
      ...doc.citations,
      entries,
      markers: linked.markers,
    },
  };
}
