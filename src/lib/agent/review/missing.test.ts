import { describe, expect, it } from "vitest";
import type { CslItem } from "@/lib/csl/types";
import type { PaperDocument } from "@/lib/doc/types";
import { dedupeCandidates } from "./missing";

const doc = {
  id: "p1",
  title: "Attention Is All You Need",
  citations: {
    entries: [
      {
        id: "ref-1",
        csl: {
          id: "ref-1",
          type: "article",
          title: "Layer Normalization",
          DOI: "10.48550/arXiv.1607.06450",
        },
      },
      {
        id: "ref-2",
        csl: {
          id: "ref-2",
          type: "article",
          title:
            "Neural Machine Translation by Jointly Learning to Align and Translate",
        },
      },
    ],
  },
} as unknown as PaperDocument;

const cand = (id: string, title: string, doi?: string): CslItem => ({
  id,
  type: "article",
  title,
  DOI: doi,
  URL: id,
});

describe("dedupeCandidates", () => {
  it("drops candidates already cited by DOI", () => {
    const out = dedupeCandidates(
      [cand("c1", "Layer Norm Reloaded", "10.48550/arxiv.1607.06450")],
      doc,
    );
    expect(out).toHaveLength(0);
  });

  it("drops candidates already cited by near-identical title", () => {
    const out = dedupeCandidates(
      [
        cand(
          "c1",
          "Neural machine translation by jointly learning to align and translate",
        ),
      ],
      doc,
    );
    expect(out).toHaveLength(0);
  });

  it("drops the paper itself and internal duplicates, keeps genuinely new work", () => {
    const out = dedupeCandidates(
      [
        cand("c1", "Attention is all you need"),
        cand(
          "c2",
          "Effective Approaches to Attention-based Neural Machine Translation",
        ),
        cand(
          "c3",
          "Effective Approaches to Attention-Based Neural Machine Translation",
        ),
      ],
      doc,
    );
    expect(out.map((c) => c.id)).toEqual(["c2"]);
  });
});
