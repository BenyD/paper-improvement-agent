declare module "@citation-js/core" {
  export class Cite {
    constructor(data: unknown);
    format(
      type: "bibliography" | "citation",
      options?: Record<string, unknown>,
    ): string;
  }
}

declare module "@citation-js/plugin-csl";
