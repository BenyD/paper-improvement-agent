import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import * as zod from "zod";
import { z } from "zod";
import type { CslItem } from "@/lib/csl/types";
import { validateOps } from "@/lib/doc/invariants";
import type { EditOp, EditProposal } from "@/lib/doc/ops";
import type { PaperDocument } from "@/lib/doc/types";
import { titleSimilarity } from "@/lib/sources/resolve";
import { modelId } from "../client";
import { searchCandidates } from "../review/missing";
import { buildDocumentContext } from "./context";
import { EDIT_AGENT } from "./instructions";

const MAX_TURNS = 10;

/** Ops as the MODEL emits them — add_reference goes via candidateId so the
 * model can only add sources this loop actually retrieved. */
const ModelOpSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("replace_paragraph"),
    sectionId: z.string(),
    paragraph: z.number().int().min(0),
    text: z.string().min(1),
  }),
  z.object({
    type: z.literal("insert_paragraph"),
    sectionId: z.string(),
    afterParagraph: z.number().int().min(-1),
    text: z.string().min(1),
  }),
  z.object({
    type: z.literal("delete_paragraph"),
    sectionId: z.string(),
    paragraph: z.number().int().min(0),
  }),
  z.object({
    type: z.literal("edit_heading"),
    sectionId: z.string(),
    heading: z.string().min(1),
  }),
  z.object({ type: z.literal("add_reference"), candidateId: z.string() }),
]);

const SearchInput = z.object({ query: z.string().min(4).max(120) });
const ProposeInput = z.object({
  summary: z.string().min(10),
  ops: z.array(ModelOpSchema).min(1),
});
const FinishInput = z.object({ reason: z.string().min(5) });

export type EditOutcome =
  | { kind: "proposal"; proposal: EditProposal }
  | { kind: "no-edit"; reason: string }
  | { kind: "failed"; reason: string };

/**
 * The natural-language editing agent: a hand-rolled tool-use loop (the path
 * is unpredictable, so this is an agent, not a workflow — Anthropic's
 * distinction). The LLM decides what to search and what ops to propose;
 * deterministic code owns everything enforceable:
 *  - sources: add_reference accepts only candidateIds from this loop's own
 *    search results (year-filtered, deduped, verified-only) — a source that
 *    was never retrieved cannot be added;
 *  - safety: propose_edit runs the invariant validator inside the loop, so an
 *    op set that would lose a citation bounces back as a tool error for the
 *    model to fix, and never reaches the user;
 *  - economy: the document context is a cached system block (prompt caching),
 *    paid once per session instead of per turn.
 */
export async function runEditAgent(
  doc: PaperDocument,
  command: string,
): Promise<EditOutcome> {
  const anthropic = new Anthropic();
  const candidates = new Map<string, CslItem>();
  let candidateSeq = 0;

  const tools: Anthropic.Tool[] = [
    {
      name: "search_papers",
      description:
        "Search OpenAlex and Semantic Scholar for real academic work (results are restricted to work the paper could have cited). Returns candidates with candidateIds usable in add_reference.",
      input_schema: zod.toJSONSchema(SearchInput) as Anthropic.Tool.InputSchema,
    },
    {
      name: "propose_edit",
      description:
        "Submit the final edit proposal. It is validated; violations come back for you to fix.",
      input_schema: zod.toJSONSchema(
        ProposeInput,
      ) as Anthropic.Tool.InputSchema,
    },
    {
      name: "finish_without_edit",
      description:
        "Use when the instruction needs no change or cannot be fulfilled honestly.",
      input_schema: zod.toJSONSchema(FinishInput) as Anthropic.Tool.InputSchema,
    },
  ];

  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: EDIT_AGENT },
    {
      type: "text",
      text: buildDocumentContext(doc),
      cache_control: { type: "ephemeral" },
    },
  ];

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: command },
  ];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const res = await anthropic.messages.create({
      model: modelId(),
      max_tokens: 4000,
      system,
      messages,
      tools,
    });

    // Dev-visible proof that the document-context cache block is working:
    // turn 1 should show cache_creation, later turns cache_read.
    console.log(
      `[edit-agent] turn ${turn + 1}: input=${res.usage.input_tokens} cache_write=${res.usage.cache_creation_input_tokens ?? 0} cache_read=${res.usage.cache_read_input_tokens ?? 0}`,
    );

    const toolUses = res.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    if (toolUses.length === 0) {
      const text = res.content.find((b) => b.type === "text")?.text ?? "";
      return {
        kind: "no-edit",
        reason: text || "The agent ended without proposing an edit.",
      };
    }

    messages.push({ role: "assistant", content: res.content });
    const results: Anthropic.ToolResultBlockParam[] = [];

    for (const use of toolUses) {
      if (use.name === "search_papers") {
        const input = SearchInput.safeParse(use.input);
        if (!input.success) {
          results.push(toolError(use.id, "Invalid search input."));
          continue;
        }
        const { items, notes } = await searchCandidates(
          input.data.query,
          doc.meta.year,
        );
        const usable = items.filter(
          (c) =>
            c.title &&
            c.URL &&
            !doc.citations.entries.some(
              (e) =>
                e.csl.title &&
                titleSimilarity(e.csl.title, c.title as string) >= 0.75,
            ),
        );
        const listed = usable.slice(0, 6).map((c) => {
          const id = `c${++candidateSeq}`;
          candidates.set(id, c);
          const nextNumber =
            doc.citations.entries.length +
            [...candidates.keys()].indexOf(id) +
            1;
          return {
            candidateId: id,
            willBecomeMarker:
              doc.citations.entryStyle === "bracket"
                ? `[${nextNumber}]`
                : undefined,
            title: c.title,
            year: c.issued?.["date-parts"]?.[0]?.[0],
            authors: (c.author ?? [])
              .slice(0, 3)
              .map((a) => a.family ?? a.literal)
              .join(", "),
            url: c.URL,
            abstract: (c.abstract ?? "").slice(0, 400),
          };
        });
        const rateLimited = notes.some((n) => n.includes("rate-limited"));
        results.push({
          type: "tool_result",
          tool_use_id: use.id,
          content: JSON.stringify(
            {
              candidates: listed,
              notes,
              ...(rateLimited && listed.length === 0
                ? {
                    advice:
                      "The academic search APIs are rate-limited right now. Do NOT keep retrying: either proceed without new references, or call finish_without_edit explaining that sources cannot be verified at the moment.",
                  }
                : {}),
            },
            null,
            1,
          ),
        });
      } else if (use.name === "finish_without_edit") {
        const input = FinishInput.safeParse(use.input);
        return {
          kind: "no-edit",
          reason: input.success ? input.data.reason : "No reason given.",
        };
      } else if (use.name === "propose_edit") {
        const input = ProposeInput.safeParse(use.input);
        if (!input.success) {
          results.push(
            toolError(
              use.id,
              `Invalid proposal shape: ${input.error.issues.map((i) => i.message).join("; ")}`,
            ),
          );
          continue;
        }
        // Translate candidateIds → real CSL from THIS loop's search results.
        const ops: EditOp[] = [];
        let badCandidate: string | null = null;
        for (const op of input.data.ops) {
          if (op.type === "add_reference") {
            const csl = candidates.get(op.candidateId);
            if (!csl) {
              badCandidate = op.candidateId;
              break;
            }
            ops.push({
              type: "add_reference",
              csl,
              resolution: {
                status: "verified",
                source: csl.custom?.openalex ? "openalex" : "semanticscholar",
                url: csl.URL,
                score: 1,
              },
            });
          } else {
            ops.push(op);
          }
        }
        if (badCandidate) {
          results.push(
            toolError(
              use.id,
              `Unknown candidateId "${badCandidate}" — only ids returned by search_papers in this session are valid.`,
            ),
          );
          continue;
        }

        const verdict = validateOps(doc, ops);
        if (!verdict.ok) {
          results.push(
            toolError(
              use.id,
              `Proposal rejected by the citation-invariant validator:\n- ${verdict.violations.join("\n- ")}\nFix the operations and propose again.`,
            ),
          );
          continue;
        }

        return {
          kind: "proposal",
          proposal: {
            id: randomUUID(),
            paperId: doc.id,
            command,
            summary: input.data.summary,
            ops,
            createdAt: new Date().toISOString(),
            status: "proposed",
            model: modelId(),
          },
        };
      }
    }

    messages.push({ role: "user", content: results });
  }

  return {
    kind: "failed",
    reason: `The agent did not produce a valid proposal within ${MAX_TURNS} turns.`,
  };
}

function toolError(
  toolUseId: string,
  message: string,
): Anthropic.ToolResultBlockParam {
  return {
    type: "tool_result",
    tool_use_id: toolUseId,
    content: message,
    is_error: true,
  };
}
