import { NextResponse } from "next/server";
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

  const body = (await req.json().catch(() => null)) as {
    command?: string;
  } | null;
  const command = body?.command?.trim();
  if (!command || command.length < 4) {
    return NextResponse.json(
      { error: "Provide an editing instruction." },
      { status: 400 },
    );
  }

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
