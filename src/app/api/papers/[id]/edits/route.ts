import { NextResponse } from "next/server";
import { z } from "zod";
import { hasAnthropicKey } from "@/lib/agent/client";
import { runEditAgent } from "@/lib/agent/edit/loop";
import { loadPaper, saveProposal } from "@/lib/storage/papers";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const doc = await loadPaper(id);
  if (!doc)
    return NextResponse.json({ error: "Paper not found." }, { status: 404 });
  if (!hasAnthropicKey()) {
    return NextResponse.json(
      {
        error:
          "ANTHROPIC_API_KEY is not configured. Add it to .env.local to use editing.",
      },
      { status: 503 },
    );
  }

  const Body = z.object({ command: z.string().trim().min(4).max(500) });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Provide an editing instruction (4-500 characters)." },
      { status: 400 },
    );
  }
  const { command } = parsed.data;

  try {
    const outcome = await runEditAgent(doc, command);
    if (outcome.kind === "proposal") {
      await saveProposal(id, outcome.proposal);
      return NextResponse.json({ proposal: outcome.proposal });
    }
    return NextResponse.json(
      { message: outcome.reason },
      { status: outcome.kind === "failed" ? 422 : 200 },
    );
  } catch (err) {
    return NextResponse.json(
      {
        error: `Edit agent failed: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 500 },
    );
  }
}
