# System Design

The two graded pieces: how a PDF becomes normalized, CSL-JSON citations, and how the agent performs peer review and natural-language editing without breaking them.

## 1. Citation parsing: PDF → CSL-JSON

Architecture note: the pipeline deliberately mirrors GROBID's design — a cascade of specialized stages operating on layout tokens rather than raw text — with documented heuristics in place of GROBID's ML models. Every stage emits a typed intermediate representation carrying a `failures[]` array: failure is data that flows to the UI, never a silent drop.

```
PDF bytes
  → P1 Extract   : pdfjs-dist text items (x, y, font, size) → lines → column-aware blocks
  → P2 Structure : heading detection (font size/weight/numbering) → title, abstract, sections
  → P3 Locate    : find the References/Bibliography region (heading match, fallback: citation-density scan)
  → P4 Segment   : split the region into entries ([n] / n. markers, hanging-indent geometry)
  → P5 Parse     : per-entry field extraction (authors, year, title, DOI, arXiv id)
                   then resolution against OpenAlex / Semantic Scholar → verified CSL-JSON
                   unresolved entries kept, flagged `unverified`
  → P6 Link      : citation-style detection (numeric / superscript / author-year)
                   → in-text marker location → marker ↔ entry binding
                   orphan markers and uncited entries surfaced
```

### P1 Extract — as implemented (`src/lib/pdf/extract.ts`)

pdfjs-dist text items become positioned spans (x/y from the transform matrix, font size from its vertical scale). Rotated runs (|b| > |a|: arXiv watermarks, figure axis labels) are skipped. Spans merge into visual lines by y-proximity (2.5pt tolerance), with word boundaries inferred from inter-span gaps. Two-column pages are handled at the line level: after y-grouping, a line whose spans sit on both sides of the midline with a clear gutter gap (and no span straddling the midline) is split into one line per column, span-straddling lines stay full-width, and the page is treated as two-column only when a substantial share of lines show gutter or right-only evidence — then lines are emitted in reading order (left column top-to-bottom, then right). Verified on BERT (31 hanging-indent references recovered from zero) and ResNet (50 bracket references). Running headers/footers and page numbers are removed GROBID-style: a line repeating near the same page edge on 3+ pages is furniture. IR: `PdfExtract { lines, pages, failures }`. Failure modes: per-page extraction errors; a text-free (scanned) PDF yields the explicit `no-text` failure rather than an empty parse.

### P2 Structure — as implemented (`src/lib/parse/structure.ts`)

Body font size = length-weighted dominant size. Title = largest-font line cluster on page 1. Bold is detected from font PostScript names (Bold/Black/Heavy/Semibold/Medi) resolved through pdfjs's font registry — the same font-name technique Firecrawl's pdf-inspector uses. Heading classification: (a) numbered lines in a larger OR bold font, plus arabic-numbered ALL-CAPS lines at body weight (ICLR style); (b) dotted-number + Title-Case lines at any size; (c) known unnumbered headings (Abstract, References, ...); (d) short standalone lines that are clearly larger or bold at body size. De-noising passes: title lines excluded, heading text recurring 3+ times (figure labels) rejected unless numbered/known, figure/table captions rejected outright, and merely-styled candidates on page 1 suppressed entirely — the title block spans both columns, so author and affiliation lines otherwise leak into the section tree. Paragraphs split on vertical gaps > 1.6× the median line gap, with hyphenation repair. Failure modes: `no-title`, `no-headings`, `no-abstract` — each surfaced, never guessed. Verified on arXiv 1706.03762: full hierarchy to level 3 (3.2.1 ...), zero failures.

### P3 Locate references — as implemented (`src/lib/parse/references.ts`)

Primary: the *last* heading matching References/Bibliography/Works Cited (last, because a ToC can mention it earlier); the region runs to the next post-reference heading (Appendix, Acknowledgments) or EOF. Fallback: citation-density scan over the final third — the longest run of citation-shaped lines (`[n]`, `n.`, author-initials patterns, tolerating wrapped continuation lines), reported as an explicit `no-heading-fallback` failure so the user knows the location was inferred. Failure mode: `not-found` with an empty region — surfaced in the UI.

### P4 Segment — as implemented (`src/lib/parse/segment.ts`)

Entry-start convention detected by counting line shapes: `[n]` → bracket, `n.` → number-dot, otherwise hanging-indent geometry (entries return to the leftmost margin; wrapped continuations are indented). Groups are joined with hyphenation repair. Numbered sequences are validated — a gap ("[2] → [4]") is a surfaced `sequence-gap` failure, and implausibly short segments are surfaced with their text, never dropped.

### P5 Parse & resolve — as implemented (`src/lib/parse/entry.ts`, `src/lib/sources/`)

Local extraction first: DOI and arXiv ids by pattern (including pre-2017 `abs/` ids), year, authors (name-shape parsers with surname-particle handling and CSL `literal` fallback — imperfect data beats dropped data), and a structural title guess (APA: the segment after the parenthesized year; otherwise the first long non-venue segment, filtering initials-heavy author continuations).

Resolution is batch-first: all DOIs go in one OpenAlex OR-filter request (50/batch), remaining arXiv ids in one Semantic Scholar `POST /paper/batch` (500/batch), S2 misses retried as OpenAlex DataCite DOIs — exact identifier matches, one round-trip each instead of N rate-limit dice-rolls. Only leftovers hit per-entry title search.

Title matches follow Crossref's SBMV design: search similarity alone never earns "verified". Every candidate ≥ 0.75 normalized token similarity (containment rule for truncated guesses) is validated against the reference's year (±1) and the candidate first author's surname in the raw reference string; a corroborated candidate is preferred over a higher-scoring uncorroborated one (this catches real cases — a title fully contained in a longer wrong title outscoring the true match), contradictions demote to a visible `low-confidence` state, and only near-perfect titles verify without corroboration. Verified entries adopt the richer API record as their CSL-JSON, including the abstract (used by the Phase-3 claim checker); unresolved entries keep local best-effort CSL flagged `unverified` with the *actual* reason (no match / HTTP status). API access goes through one disk-cached, per-host-throttled, retry-with-backoff fetch (`sources/cache.ts`) that also memoizes the POST batches; API outages degrade to honest unverified states, never fabricated matches. Measured on arXiv 1706.03762: 39/40 verified with correct links, 1 unverified with its real cause, ~29s cold / instant warm.

### P6 Link markers — as implemented (`src/lib/parse/markers.ts`)

Style detection counts pattern hits across the body: `[n]`/`[n,m]`/`[n-m]` brackets, `⟦^n⟧` superscript tokens (emitted by P1 for raised small-font digit runs), and author-year forms — parenthetical `(Smith et al., 2020; Jones and Lee, 2019)` with semicolon groups, and narrative `Smith et al. (2020)`. The dominant pattern is the paper's citation style. Numeric markers link by list index (ranges expanded); author-year markers link by first-author surname + year against parsed CSL fields with raw-text fallback. In a non-superscript paper, superscript tokens that link to nothing are classified as footnote marks and dropped — everything else that fails to link is surfaced: orphan markers (cite nothing in the list), and never-cited reference entries. Measured on the test paper: 102 markers, style `numeric-bracket`, zero orphans.

### Where CSL-JSON fits

One canonical model: every citation — parsed from the PDF or fetched from an API — converges to CSL-JSON. Rendering (bibliography, inserted citations) goes exclusively through citeproc with a .csl style; the paper's style is detected in P6 (fallback: user choice). No hand-rolled citation formatting anywhere.

### Style and failure handling

Reference-list styles: bracket (`[n]`), number-dot (`n.`), hanging-indent author-year — detected by counting line shapes, with margin geometry as the fallback. In-text styles: numeric brackets (lists and ranges), superscript (via P1's raised-digit tokens), author-year (parenthetical with semicolon groups, narrative with `et al.`/`and`/`&`), detected by counting pattern hits; the dominant pattern wins and maps to a CSL template for rendering (numeric → Vancouver, author-year → APA; vendoring IEEE `.csl` is listed future work). Failures flow end-to-end as data: an unparseable entry stays visible with its raw text and an "unverified" badge carrying the real cause; markers that link to nothing are orphans in the UI; ambiguous author-year matches ("Smith 2020" matching two entries) are reported, never guessed.

This architecture independently matches the three-rubric framework in the citation-verifier literature (HALLMARK): *structural* verification is our CSL parse, *resolvability* is API resolution with links, *semantic* is the claim checker.

### Export (LaTeX round trip)

`src/lib/export/latex.ts` rebuilds the paper: section hierarchy from levels, LaTeX-escaped text, numeric markers converted to `\cite{ref-n}` (lists and ranges expanded through the entry map — unknown markers are left as text, never fabricated into keys), and a `thebibliography` whose entries are each rendered through citeproc in the template matching the detected citation style, with the raw parsed text as the honest fallback. A companion BibTeX export carries the references as data. The exported `.tex` of the test paper compiles with tectonic, including post-edit state (the added reference appears as `\cite{ref-41}` + bibitem).

## 2. The agent: peer review + natural-language editing

Design follows Anthropic's "Building Effective Agents": the predictable path is a hardcoded workflow, the unpredictable one is a small tool-use agent, and the safety property is enforced by deterministic code rather than prompts.

### Why no agent framework

We evaluated Vercel's eve (June 2026, beta) and Cloudflare's Agents SDK (Durable-Object-backed stateful agents, expanded during Agents Week 2026) and deliberately built the agent layer by hand on the raw Anthropic SDK. Reasons:

- What frameworks provide — durable sessions, multi-channel entry points, sandboxed compute, deployment plumbing — is infrastructure this app does not need: one user, one process, short-lived runs against a local document.
- What this app *does* need — typed edit operations, a deterministic citation-invariant gate, honest API error surfacing — no framework provides; it is domain logic either way.
- The 12-factor-agents observation matches our experience: a reliable agent is mostly deterministic software with the LLM confined to the decision points where probabilistic reasoning helps (relevance judgment, entailment, edit proposal). Owning the loop (~100 LOC) keeps every control-flow decision inspectable and testable.
- We keep the good conventions frameworks converge on — one typed tool per file, instructions separate from code, human approval as a first-class step (eve-style layout) — so the layer would port to eve or the Cloudflare Agents SDK if it ever needed durable, deployed sessions.

### Peer review (orchestrated workflow — predictable path, hardcoded)

As implemented (`src/lib/agent/review/`): a six-step pipeline where the LLM makes exactly three kinds of narrow judgments and deterministic code does everything else.

1. **Section selection** (code): main body sections, bounded excerpts, front matter/acknowledgments skipped.
2. **Query generation** (LLM, 1 call): section excerpts → ≤2 specific academic search queries per section, enforced by a deterministic guard.
3. **Search** (code): OpenAlex + Semantic Scholar per query — real APIs, disk-cached; failures become visible process notes.
4. **Dedupe** (code): candidates already cited (DOI or title ≥ 0.75 similar), the paper itself, and near-duplicate candidates are removed before any model sees them.
5. **Relevance judgment** (LLM, 1 call/section): candidates with their *real abstracts* in context; the prompt demands where-and-why per acceptance and prefers empty results over padding; capped at 3 findings/section.
6. **Claim checking** (LLM, 1 call/entry): for every cited entry with a verified abstract, all citing sentences (extracted by a deterministic sentence-boundary walker that survives "et al.") are judged against that abstract: supports / partially-supports / does-not-support / cannot-tell, with "cannot-tell" explicitly sanctioned. Entries without abstracts are skipped and counted — honesty over guessing.

Every model call goes through one `structured()` entry point (forced tool-use + zod validation — no freeform JSON parsing anywhere), with prompts in a separate instructions module. Every finding carries the real source's link; findings stream to the UI over SSE as they are produced, followed by stats (sections scanned, claims checked/supported, skips) and process notes. A missing API key degrades to a clear 503, not a broken page.

### Editing (tool-use agent — unpredictable path)

As implemented (`src/lib/agent/edit/`): a hand-rolled Anthropic tool-use loop (max 10 turns) with three tools — `search_papers`, `propose_edit`, `finish_without_edit` — and the full document (sections with stable ids and original paragraph indices, plus the reference library) as a **prompt-cached system block**, paid once per session rather than per turn. Measured on the test paper: turn 1 writes 14,062 tokens to cache; every later turn reads all 14,062 from cache (billed at 10% of base input) with only ~1k fresh tokens. Other API cost features were considered and rejected: the Batch API (async, incompatible with an interactive review the user watches stream), fast mode (Opus-only preview; our outputs are small structured verdicts, not long generations), and the advisor tool (beta, aimed at long-horizon loops; our plan quality lives in the deterministic validator, which is the point of the design).

A command becomes actions like this: the model reads the cached document context, optionally calls `search_papers` (year-filtered to work the paper could have cited, deduped against existing references, results assigned `candidateId`s), and finishes by calling `propose_edit` with typed operations: `replace_paragraph`, `insert_paragraph`, `delete_paragraph`, `edit_heading`, `add_reference`. Citations are not a separate operation — markers live inline in the text ("[41]", "(Smith, 2020)") and are re-linked by the same P6 linker the parser uses, so the integrity check sees exactly what a re-parse would see.

Two structural guarantees are enforced by the loop itself, not by prompting:
- **Sources can only come from tool results.** `add_reference` accepts a `candidateId` from this session's own searches; the loop translates it to the real CSL record. A source the agent never retrieved cannot be added — fabrication is structurally impossible, not merely discouraged.
- **Validation happens inside the loop.** `propose_edit` runs the invariant validator; violations return as tool errors the model must fix. An op set that would lose a citation never reaches the user. When the search APIs are rate-limited, the tool result says so and instructs the model to finish honestly rather than retry-loop.

### Citation integrity (the non-negotiable)

The LLM proposes; code enforces; the user approves. `validateOps` (`src/lib/doc/invariants.ts`) rejects any op set where: a previously-cited reference would no longer be cited anywhere (set semantics — no reference loses its last citation; explicit removal is not an operation this system offers), the edited text cites a marker that resolves to no entry (fabrication), a new reference is not verified against a real source, an entry would disappear, or the ops are structurally unsound (bad section/paragraph, conflicting targets). It runs twice: inside the agent loop at proposal time, and again at approval time against the current document. Violations are not repairable by prompting because the check is not a prompt. The validator has its own test suite covering the drop/move/delete/fabricate/unverified cases; approval archives the previous document version before applying.

### When verification happens

Three moments, one honesty rule. (1) **Parse time**: every parsed reference is resolved against OpenAlex/Semantic Scholar (batch identifiers, corroborated title search) — badges, links and abstracts exist before any LLM is involved. (2) **Edit time**: a citation the agent wants to ADD is verified as part of its own search; it cannot enter the document otherwise. (3) **On demand**: entries left unverified by API rate limits carry a "Retry verification" action that re-resolves only the unverified entries in place — the document id, approved edits and history all survive, and verified entries are never re-touched. Review time deliberately adds no re-verification: it reasons on top of the parse-time foundation (claim checks use stored abstracts, and only for verified entries).

### External APIs

<!-- As implemented: client design, on-disk cache under data/cache/, rate limits,
     honest empty-result and error states. -->
