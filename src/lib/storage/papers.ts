import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
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
