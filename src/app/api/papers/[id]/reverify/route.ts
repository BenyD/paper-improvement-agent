import { NextResponse } from "next/server";
import { resolveCitations } from "@/lib/parse/pipeline";
import { loadPaper, saveDocumentVersion } from "@/lib/storage/papers";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Re-run verification for entries that are not yet verified (e.g. earlier
 * API rate limits), in place — the document keeps its id, edits and history.
 * Verified entries are never touched.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const doc = await loadPaper(id);
  if (!doc)
    return NextResponse.json({ error: "Paper not found." }, { status: 404 });

  const before = doc.citations.entries.filter(
    (e) => e.resolution.status !== "verified",
  ).length;
  if (before === 0) {
    return NextResponse.json({ ok: true, healed: 0, remaining: 0 });
  }

  const updated = await resolveCitations(doc, {
    onlyUnverified: true,
    timeBudgetMs: 120_000,
  });
  await saveDocumentVersion(updated);

  const remaining = updated.citations.entries.filter(
    (e) => e.resolution.status !== "verified",
  ).length;
  return NextResponse.json({ ok: true, healed: before - remaining, remaining });
}
