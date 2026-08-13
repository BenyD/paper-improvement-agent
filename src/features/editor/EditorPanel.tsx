"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { EditProposal } from "@/lib/doc/ops";
import type { PaperDocument } from "@/lib/doc/types";
import { OpView } from "./DiffView";

type Phase = "idle" | "thinking" | "reviewing" | "deciding";

export function EditorPanel({
  doc,
  pastProposals,
}: {
  doc: PaperDocument;
  pastProposals: EditProposal[];
}) {
  const router = useRouter();
  const [command, setCommand] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [proposal, setProposal] = useState<EditProposal | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const propose = async () => {
    setPhase("thinking");
    setError("");
    setMessage("");
    setProposal(null);
    try {
      const res = await fetch(`/api/papers/${doc.id}/edits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command }),
      });
      const json = (await res.json()) as {
        proposal?: EditProposal;
        message?: string;
        error?: string;
      };
      if (json.proposal) {
        setProposal(json.proposal);
        setPhase("reviewing");
      } else if (json.message) {
        setMessage(json.message);
        setPhase("idle");
      } else {
        setError(json.error ?? `Request failed (${res.status}).`);
        setPhase("idle");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
      setPhase("idle");
    }
  };

  const decide = async (action: "approve" | "reject") => {
    if (!proposal) return;
    setPhase("deciding");
    try {
      const res = await fetch(`/api/papers/${doc.id}/edits/${proposal.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        violations?: string[];
      };
      if (!json.ok) {
        setError(
          [json.error, ...(json.violations ?? [])].filter(Boolean).join(" "),
        );
        setPhase("reviewing");
        return;
      }
      setProposal(null);
      setCommand("");
      setMessage(
        action === "approve"
          ? "Edit applied. The document below reflects the change."
          : "Proposal rejected.",
      );
      setPhase("idle");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Decision failed.");
      setPhase("reviewing");
    }
  };

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
        Edit by instruction
      </h2>

      <div className="flex gap-2">
        <input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              command.trim().length >= 4 &&
              phase === "idle"
            )
              void propose();
          }}
          placeholder='e.g. "make the introduction more concise" or "add supporting citations to section 2"'
          disabled={phase === "thinking"}
          className="w-full rounded-lg border border-neutral-300 bg-transparent px-4 py-2.5 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700"
        />
        <button
          type="button"
          onClick={() => void propose()}
          disabled={phase === "thinking" || command.trim().length < 4}
          className="shrink-0 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          {phase === "thinking" ? "Working..." : "Propose edit"}
        </button>
      </div>
      {phase === "thinking" && (
        <p className="mt-2 animate-pulse text-sm text-neutral-500">
          The agent is reading the paper, searching for sources if needed, and
          drafting a validated proposal...
        </p>
      )}

      {message && (
        <p className="mt-3 rounded-lg bg-neutral-50 px-4 py-3 text-sm dark:bg-neutral-900">
          {message}
        </p>
      )}
      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {error}
        </p>
      )}

      {proposal && (
        <div className="mt-4 rounded-xl border border-neutral-300 dark:border-neutral-700">
          <div className="border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
            <p className="text-sm font-medium">{proposal.summary}</p>
            <p className="mt-1 text-xs text-neutral-500">
              {proposal.ops.length} operation
              {proposal.ops.length === 1 ? "" : "s"} · validated: no citations
              lost · model {proposal.model}
            </p>
          </div>
          <div className="flex flex-col gap-4 px-4 py-4">
            {proposal.ops.map((op, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static proposal render
              <OpView key={i} op={op} doc={doc} />
            ))}
          </div>
          <div className="flex gap-2 border-t border-neutral-200 px-4 py-3 dark:border-neutral-800">
            <button
              type="button"
              onClick={() => void decide("approve")}
              disabled={phase === "deciding"}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              Approve & apply
            </button>
            <button
              type="button"
              onClick={() => void decide("reject")}
              disabled={phase === "deciding"}
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
            >
              Reject
            </button>
          </div>
        </div>
      )}

      {pastProposals.length > 0 && (
        <details className="mt-4 rounded-lg border border-neutral-200 dark:border-neutral-800">
          <summary className="cursor-pointer select-none px-4 py-2.5 text-sm font-medium text-neutral-500 hover:bg-neutral-50 dark:hover:bg-neutral-900">
            Edit history ({pastProposals.length})
          </summary>
          <ul className="flex flex-col gap-2 border-t border-neutral-100 px-4 py-3 dark:border-neutral-800">
            {pastProposals.map((p) => (
              <li key={p.id} className="text-sm">
                <span
                  className={`mr-2 rounded-full px-2 py-0.5 text-xs font-medium ${
                    p.status === "approved"
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                      : p.status === "rejected"
                        ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400"
                        : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
                  }`}
                >
                  {p.status}
                </span>
                <span className="font-medium">"{p.command}"</span>
                <span className="text-neutral-500"> — {p.summary}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
