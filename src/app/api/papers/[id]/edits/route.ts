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

  // SSE: progress events narrate the agent's real actions (reading,
  // searching with the actual query, validating), then one done/error event.
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (ev: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
        } catch {}
      };
      const close = () => {
        try {
          controller.close();
        } catch {}
      };
      runEditAgent(doc, command, (message) =>
        send({ type: "progress", message }),
      )
        .then(async (outcome) => {
          if (outcome.kind === "proposal") {
            await saveProposal(id, outcome.proposal);
            send({ type: "done", proposal: outcome.proposal });
          } else {
            send({
              type: "done",
              message: outcome.reason,
              failed: outcome.kind === "failed",
            });
          }
          close();
        })
        .catch((err) => {
          send({
            type: "error",
            message: `Edit agent failed: ${err instanceof Error ? err.message : String(err)}`,
          });
          close();
        });
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
