import { NextResponse } from "next/server";
import { exportBibtex, exportLatex } from "@/lib/export/latex";
import { exportMarkdown } from "@/lib/export/markdown";
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

  const search = new URL(req.url).searchParams;
  const format = search.get("format") ?? "tex";
  // Optional CSL style override; the detected style is the default.
  const styleParam = search.get("style");
  const style =
    styleParam === "apa" ||
    styleParam === "vancouver" ||
    styleParam === "harvard1"
      ? styleParam
      : undefined;
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
    return new Response(exportLatex(doc, style), {
      headers: {
        "Content-Type": "application/x-tex; charset=utf-8",
        "Content-Disposition": `attachment; filename="${base}.tex"`,
      },
    });
  }
  if (format === "md") {
    return new Response(exportMarkdown(doc, style), {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${base}.md"`,
      },
    });
  }
  return NextResponse.json(
    { error: "format must be tex, bib, or md." },
    { status: 400 },
  );
}
