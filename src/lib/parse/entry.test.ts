import { describe, expect, it } from "vitest";
import { extractEntryFields } from "./entry";

describe("extractEntryFields", () => {
  it("extracts DOI, year and title from an APA-style entry", () => {
    const { csl, titleGuess } = extractEntryFields(
      "Devlin, J., Chang, M. W., Lee, K. (2019). BERT: Pre-training of deep bidirectional transformers for language understanding. In NAACL, pages 4171-4186. https://doi.org/10.18653/v1/N19-1423",
    );
    expect(csl.DOI).toBe("10.18653/v1/N19-1423");
    expect(csl.issued?.["date-parts"][0][0]).toBe(2019);
    expect(titleGuess).toContain("BERT");
  });

  it("extracts an arXiv id", () => {
    const { csl } = extractEntryFields(
      "Jimmy Lei Ba, Jamie Ryan Kiros, and Geoffrey E Hinton. Layer normalization. arXiv preprint arXiv:1607.06450, 2016.",
    );
    expect(csl.custom?.arxiv).toBe("1607.06450");
    expect(csl.issued?.["date-parts"][0][0]).toBe(2016);
  });

  it("parses 'Given Family' author lists", () => {
    const { csl } = extractEntryFields(
      "Ashish Vaswani, Noam Shazeer, and Niki Parmar. Attention is all you need. In NeurIPS, 2017.",
    );
    const families = (csl.author ?? []).map((a) => a.family);
    expect(families).toContain("Vaswani");
    expect(families).toContain("Shazeer");
    expect(families).toContain("Parmar");
  });

  it("picks the title segment, not the venue", () => {
    const { titleGuess } = extractEntryFields(
      "Kaiming He, Xiangyu Zhang. Deep residual learning for image recognition. In Proceedings of CVPR, 2016.",
    );
    expect(titleGuess).toBe("Deep residual learning for image recognition");
  });

  it("returns no title guess rather than a wrong one for unparseable text", () => {
    const { titleGuess } = extractEntryFields("??? 12345 !!!");
    expect(titleGuess).toBeNull();
  });

  it("extracts pre-2017 CoRR-style arXiv ids (abs/...)", () => {
    const { csl } = extractEntryFields(
      "Dzmitry Bahdanau, Kyunghyun Cho. Neural machine translation. CoRR, abs/1409.0473, 2014.",
    );
    expect(csl.custom?.arxiv).toBe("1409.0473");
  });

  it("keeps surname particles with the family name", () => {
    const { csl } = extractEntryFields(
      "Laurens van der Maaten and Geoffrey Hinton. Visualizing data using t-SNE. JMLR, 2008.",
    );
    expect((csl.author ?? []).map((a) => a.family)).toContain("van der Maaten");
  });
});

describe("extractEntryFields — IEEE initials-first entries", () => {
  it("parses initials-first author lists before a quoted title", () => {
    const { csl } = extractEntryFields(
      'N. Kamble and N. Mishra, "Hybrid optimization enabled squeeze net for phishing attack detection," Comput. Secur., vol. 144, Sep. 2024, Art. no. 103901.',
    );
    expect(csl.title).toBe(
      "Hybrid optimization enabled squeeze net for phishing attack detection",
    );
    expect(csl.author?.length).toBe(2);
    expect(csl.author?.[0].family).toBe("Kamble");
    expect(csl.author?.[1].family).toBe("Mishra");
  });

  it("keeps long initials-first lists intact across the segment split", () => {
    const { csl } = extractEntryFields(
      'E. S. Shombot, G. Dusserre, R. Bestak, and N. B. Ahmed, "An application for predicting phishing attacks: A case of implementing a support vector machine learning model," Cyber Secur. Appl., vol. 2, Jan. 2024.',
    );
    expect(csl.author?.length).toBe(4);
    expect(csl.author?.[0].family).toBe("Shombot");
    expect(csl.author?.[3].family).toBe("Ahmed");
  });
});
