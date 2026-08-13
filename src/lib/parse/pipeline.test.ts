import { describe, expect, it } from "vitest";
import { computePaperYear } from "./pipeline";

describe("computePaperYear", () => {
  it("uses the newest reference year as the anchor", () => {
    expect(computePaperYear(null, [2014, 2017, 2016])).toBe(2017);
  });
  it("caps a lagging re-render CreationDate (arXiv revisions) near the refs", () => {
    expect(computePaperYear(2023, [2014, 2017])).toBe(2018);
  });
  it("agreeing metadata passes through", () => {
    expect(computePaperYear(2017, [2015, 2017])).toBe(2017);
  });
  it("falls back to metadata alone, then null", () => {
    expect(computePaperYear(2020, [])).toBe(2020);
    expect(computePaperYear(null, [])).toBeNull();
  });
});
