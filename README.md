# Paper Improvement Agent

Upload a research paper PDF, get a peer review grounded in real academic search (Semantic Scholar + OpenAlex), and improve the paper with natural-language editing commands — without ever losing a citation.

Built for the AnswerThis founding engineer assessment ([brief](docs/AnswerThis-Founding-Engineer-Assessment%20(2).pdf)).

## Run it

```bash
npm install
cp .env.example .env.local   # add your ANTHROPIC_API_KEY
npm run dev                  # http://localhost:3000
```

- `ANTHROPIC_API_KEY` is required for peer review and editing (the agent). Upload and citation parsing work without it.
- `SEMANTIC_SCHOLAR_API_KEY` is optional (higher rate limits); OpenAlex needs no key.
- Test with any real paper — an arXiv PDF works best because its references resolve on both APIs.

```bash
npm test        # vitest unit suite (parsing stages, invariant validator)
npm run lint    # biome
npm run typecheck
```

## What it does

<!-- Filled in as phases land: parse view, peer review, agentic editing, export -->

## System design

See [docs/SYSTEM_DESIGN.md](docs/SYSTEM_DESIGN.md) — covers the citation-parsing pipeline (PDF → CSL-JSON) and the agent architecture (peer review + natural-language editing).

## Where AI tools were used

<!-- Required by the brief. Keep honest and specific; update per phase. -->

This project was built with Claude Code (Claude Fable 5). The division of labor:

- AI-written: (to fill in per phase)
- Human-designed and verified: (to fill in per phase)

## Known limitations

- Scanned PDFs (no text layer) are rejected with an explicit failure; OCR is not supported.
- Footnote and figure-caption text can merge into body paragraphs (font-size-based block classification is future work; spans are already preserved to enable it).
- Mathematical formulas extract as garbled glyph runs; they are ignored by citation logic.
- Pages mixing full-width and two-column blocks can locally misorder text; standard single- and two-column layouts are handled.
- Semantic Scholar's unauthenticated pool rate-limits aggressively (HTTP 429). Batch requests mostly avoid this; when it still hits, affected entries stay honestly "unverified" with the real cause, and an optional `SEMANTIC_SCHOLAR_API_KEY` removes the rest.
- Bold text is not exposed by pdfjs text items, so unnumbered body-size subsection headings can be missed (numbered ones are caught by pattern).
- Claim checking judges against the cited work's *abstract* (full texts are not fetched). Abstracts omit details, so the checker can over-flag broad or detail-heavy claims even with prompting toward "cannot-tell"; verdicts are surfaced with confidence levels and severity so the author stays the judge.
- Missing-work review correctly refuses to suggest papers published after the reviewed paper — reviewing an older classic therefore legitimately yields few or no missing-work findings.

## With more time

- Production path: Postgres + object storage for papers, authenticated multi-tenant workspaces, Redis-backed job queue for long-running reviews.
- (to fill in)
