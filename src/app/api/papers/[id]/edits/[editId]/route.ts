import { NextResponse } from "next/server";
import { z } from "zod";
import { validateOps } from "@/lib/doc/invariants";
import {
  loadPaper,
  loadProposal,
  saveDocumentVersion,
  saveProposal,
} from "@/lib/storage/papers";

export const runtime = "nodejs";

/** Approve or reject a proposal. Approval re-validates against the CURRENT
 * document (it may have changed since proposal time) and applies atomically. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; editId: string }> },
) {
  const { id, editId } = await params;
  const doc = await loadPaper(id);
  const proposal = await loadProposal(id, editId);
  if (!doc || !proposal)
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (proposal.status !== "proposed") {
    return NextResponse.json(
      { error: `Proposal is already ${proposal.status}.` },
      { status: 409 },
    );
  }

  const Body = z.object({ action: z.enum(["approve", "reject"]) });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "action must be approve or reject." },
      { status: 400 },
    );
  }
  const body = parsed.data;
  if (body.action === "reject") {
    await saveProposal(id, { ...proposal, status: "rejected" });
    return NextResponse.json({ ok: true, status: "rejected" });
  }
  const verdict = validateOps(doc, proposal.ops);
  if (!verdict.ok) {
    return NextResponse.json(
      {
        error:
          "The proposal no longer passes validation against the current document.",
        violations: verdict.violations,
      },
      { status: 409 },
    );
  }

  await saveDocumentVersion(verdict.after);
  await saveProposal(id, { ...proposal, status: "approved" });
  return NextResponse.json({ ok: true, status: "approved" });
}
