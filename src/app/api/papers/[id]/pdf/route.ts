import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { loadPaper } from "@/lib/storage/papers";

export const runtime = "nodejs";

/** Serve the originally uploaded PDF, for the side-by-side source preview. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // loadPaper validates the id (UUID path check) before any fs access.
  const doc = await loadPaper(id);
  if (!doc)
    return NextResponse.json({ error: "Paper not found." }, { status: 404 });

  try {
    const bytes = await readFile(
      path.join(process.cwd(), "data", "papers", id, "paper.pdf"),
    );
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${doc.meta.filename}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "The original PDF is not stored for this paper." },
      { status: 404 },
    );
  }
}
