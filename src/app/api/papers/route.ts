import { NextResponse } from "next/server";
import { parsePaper } from "@/lib/parse/pipeline";
import { savePaper } from "@/lib/storage/papers";

export const runtime = "nodejs";

const MAX_SIZE = 50 * 1024 * 1024;

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }
  if (
    !file.name.toLowerCase().endsWith(".pdf") &&
    file.type !== "application/pdf"
  ) {
    return NextResponse.json(
      { error: "Only PDF files are supported." },
      { status: 415 },
    );
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: "PDF exceeds the 50 MB limit." },
      { status: 413 },
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  try {
    const doc = await parsePaper(bytes, file.name);
    await savePaper(doc, bytes);
    return NextResponse.json({ id: doc.id, failures: doc.failures.length });
  } catch (err) {
    return NextResponse.json(
      {
        error: `Parsing failed: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 422 },
    );
  }
}
