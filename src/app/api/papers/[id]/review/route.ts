import { NextResponse } from "next/server";
import { hasAnthropicKey } from "@/lib/agent/client";
import { runReview } from "@/lib/agent/review/run";
import type { ReviewEvent } from "@/lib/agent/review/types";
import { loadPaper, saveReview } from "@/lib/storage/papers";

export const runtime = "nodejs";

/** SSE stream: progress + findings as they are produced, then `done`. */
export async function GET(
  _req: Request,
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
          "ANTHROPIC_API_KEY is not configured. Add it to .env.local to run peer review.",
      },
      { status: 503 },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const emit = (ev: ReviewEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
      };
      runReview(doc, emit)
        .then(async (result) => {
          await saveReview(id, result);
          controller.close();
        })
        .catch((err) => {
          emit({
            type: "error",
            message: err instanceof Error ? err.message : String(err),
          });
          controller.close();
        });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
