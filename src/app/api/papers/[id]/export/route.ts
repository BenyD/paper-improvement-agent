import { NextResponse } from "next/server";
import { exportBibtex, exportLatex } from "@/lib/export/latex";
import { loadPaper } from "@/lib/storage/papers";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const doc = await loadPaper(id);
  if (!doc)
    return NextResponse.json({ error: "Paper not found." }, { status: 404 });

  const format = new URL(req.url).searchParams.get("format") ?? "tex";
  const base = (doc.title || "paper")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .slice(0, 60);

  if (format === "bib") {
    return new Response(exportBibtex(doc), {
      headers: {
        "Content-Type": "application/x-bibtex; charset=utf-8",
        "Content-Disposition": `attachment; filename="${base}.bib"`,
      },
    });
  }
  if (format === "tex") {
    return new Response(exportLatex(doc), {
      headers: {
        "Content-Type": "application/x-tex; charset=utf-8",
        "Content-Disposition": `attachment; filename="${base}.tex"`,
      },
    });
  }
  return NextResponse.json(
    { error: "format must be tex or bib." },
    { status: 400 },
  );
}
