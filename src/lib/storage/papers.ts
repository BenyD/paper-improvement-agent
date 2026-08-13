import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ReviewResult } from "../agent/review/types";
import type { PaperDocument } from "../doc/types";

const DATA_DIR = path.join(process.cwd(), "data", "papers");

function paperDir(id: string): string {
  // ids are server-generated UUIDs; reject anything else to keep paths safe.
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error(`Invalid paper id: ${id}`);
  return path.join(DATA_DIR, id);
}

export async function savePaper(
  doc: PaperDocument,
  pdfBytes: Uint8Array,
): Promise<void> {
  const dir = paperDir(doc.id);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "paper.pdf"), pdfBytes);
  await writeFile(
    path.join(dir, "document.json"),
    JSON.stringify(doc, null, 2),
  );
}

export async function loadPaper(id: string): Promise<PaperDocument | null> {
  try {
    const raw = await readFile(
      path.join(paperDir(id), "document.json"),
      "utf8",
    );
    return JSON.parse(raw) as PaperDocument;
  } catch {
    return null;
  }
}

export interface PaperListing {
  id: string;
  title: string;
  filename: string;
  uploadedAt: string;
  referenceCount: number;
}

/** Recent uploads, newest first — the landing page's library. */
export async function listPapers(limit = 20): Promise<PaperListing[]> {
  let ids: string[];
  try {
    ids = await readdir(DATA_DIR);
  } catch {
    return [];
  }
  const listings: PaperListing[] = [];
  for (const id of ids) {
    const doc = await loadPaper(id).catch(() => null);
    if (!doc) continue;
    listings.push({
      id: doc.id,
      title: doc.title || doc.meta.filename,
      filename: doc.meta.filename,
      uploadedAt: doc.meta.uploadedAt,
      referenceCount: doc.citations.entries.length,
    });
  }
  return listings
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
    .slice(0, limit);
}

export async function saveReview(
  paperId: string,
  review: ReviewResult,
): Promise<void> {
  await writeFile(
    path.join(paperDir(paperId), "review.json"),
    JSON.stringify(review, null, 2),
  );
}

export async function loadReview(
  paperId: string,
): Promise<ReviewResult | null> {
  try {
    const raw = await readFile(
      path.join(paperDir(paperId), "review.json"),
      "utf8",
    );
    return JSON.parse(raw) as ReviewResult;
  } catch {
    return null;
  }
}
