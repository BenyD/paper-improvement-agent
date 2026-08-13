import { describe, expect, it } from "vitest";
import type { Line } from "../pdf/types";
import { segmentReferences } from "./segment";

const line = (text: string, x = 72): Line => ({
  text,
  x,
  y: 0,
  page: 10,
  fontSize: 9,
  column: 0,
  bold: false,
  spans: [],
});

describe("segmentReferences", () => {
  it("segments bracket-numbered entries with wrapped lines", () => {
    const result = segmentReferences([
      line(
        "[1] Jimmy Lei Ba, Jamie Ryan Kiros, and Geoffrey E Hinton. Layer normalization. arXiv preprint",
      ),
      line("arXiv:1607.06450, 2016."),
      line(
        "[2] Dzmitry Bahdanau, Kyunghyun Cho, and Yoshua Bengio. Neural machine translation by jointly",
      ),
      line("learning to align and translate. CoRR, abs/1409.0473, 2014."),
      line(
        "[3] Denny Britz, Anna Goldie, Minh-Thang Luong, and Quoc V. Le. Massive exploration of neural",
      ),
      line("machine translation architectures. CoRR, abs/1703.03906, 2017."),
    ]);

    expect(result.style).toBe("bracket");
    expect(result.entries).toHaveLength(3);
    expect(result.entries[0].marker).toBe("1");
    expect(result.entries[0].text).toContain(
      "Layer normalization. arXiv preprint arXiv:1607.06450, 2016.",
    );
    expect(result.failures).toHaveLength(0);
  });

  it("reports numbering gaps instead of hiding them", () => {
    const result = segmentReferences([
      line("[1] First Author. A paper title that is long enough. Venue, 2020."),
      line(
        "[2] Second Author. Another paper title that qualifies. Venue, 2021.",
      ),
      line("[4] Fourth Author. A third valid paper title here. Venue, 2022."),
    ]);
    expect(result.entries).toHaveLength(3);
    expect(result.failures.some((f) => f.code === "sequence-gap")).toBe(true);
  });

  it("segments hanging-indent author-year entries by margin geometry", () => {
    const result = segmentReferences([
      line(
        "Vaswani, A., Shazeer, N., et al. (2017). Attention is all you need.",
        72,
      ),
      line("In Advances in Neural Information Processing Systems.", 86),
      line(
        "Devlin, J., Chang, M. (2019). BERT: Pre-training of deep bidirectional",
        72,
      ),
      line("transformers for language understanding. In NAACL.", 86),
    ]);
    expect(result.style).toBe("hanging-indent");
    expect(result.entries).toHaveLength(2);
    expect(result.entries[1].text).toContain("BERT");
  });

  it("surfaces implausibly short segments as failures, never silently drops", () => {
    const result = segmentReferences([
      line(
        "[1] Real Author. A real paper with a plausible length. Venue, 2020.",
      ),
      line("[2] x."),
      line(
        "[3] Another Author. Another real paper title of length. Venue, 2021.",
      ),
    ]);
    expect(result.entries).toHaveLength(2);
    const short = result.failures.find((f) => f.code === "entry-too-short");
    expect(short?.context).toContain("[2]");
  });
});
