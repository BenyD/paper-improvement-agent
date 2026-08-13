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

pdfjs-dist text items become positioned spans (x/y from the transform matrix, font size from its vertical scale). Rotated runs (|b| > |a|: arXiv watermarks, figure axis labels) are skipped. Spans merge into visual lines by y-proximity (2.5pt tolerance), with word boundaries inferred from inter-span gaps. Columns per page are detected from the x-start distribution (a second cluster past the midline ⇒ two-column) and lines are emitted in reading order (left column top-to-bottom, then right). Running headers/footers and page numbers are removed GROBID-style: a line repeating near the same page edge on 3+ pages is furniture. IR: `PdfExtract { lines, pages, failures }`. Failure modes: per-page extraction errors; a text-free (scanned) PDF yields the explicit `no-text` failure rather than an empty parse.

### P2 Structure — as implemented (`src/lib/parse/structure.ts`)

Body font size = length-weighted dominant size. Title = largest-font line cluster on page 1. Heading classification: (a) numbered lines ("3", "3.1", "IV.") in a larger font; (b) dotted-number + Title-Case lines at any size (many templates set subsections at body size, bold only — bold is not reliably exposed by pdfjs); (c) known unnumbered headings (Abstract, References, ...); (d) short standalone larger-font lines. Two de-noising passes: title lines are excluded, and any heading text recurring 3+ times (repeated figure labels) is rejected unless numbered/known. Paragraphs split on vertical gaps > 1.6× the median line gap, with hyphenation repair. Failure modes: `no-title`, `no-headings`, `no-abstract` — each surfaced, never guessed. Verified on arXiv 1706.03762: full hierarchy to level 3 (3.2.1 ...), zero failures.

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

<!-- Styles supported, detection algorithm, what happens to unparseable entries end-to-end. -->

## 2. The agent: peer review + natural-language editing

Design follows Anthropic's "Building Effective Agents": the predictable path is a hardcoded workflow, the unpredictable one is a small tool-use agent, and the safety property is enforced by deterministic code rather than prompts.

### Why no agent framework

We evaluated Vercel's eve (June 2026, beta) and Cloudflare's Agents SDK (Durable-Object-backed stateful agents, expanded during Agents Week 2026) and deliberately built the agent layer by hand on the raw Anthropic SDK. Reasons:

- What frameworks provide — durable sessions, multi-channel entry points, sandboxed compute, deployment plumbing — is infrastructure this app does not need: one user, one process, short-lived runs against a local document.
- What this app *does* need — typed edit operations, a deterministic citation-invariant gate, honest API error surfacing — no framework provides; it is domain logic either way.
- The 12-factor-agents observation matches our experience: a reliable agent is mostly deterministic software with the LLM confined to the decision points where probabilistic reasoning helps (relevance judgment, entailment, edit proposal). Owning the loop (~100 LOC) keeps every control-flow decision inspectable and testable.
- We keep the good conventions frameworks converge on — one typed tool per file, instructions separate from code, human approval as a first-class step (eve-style layout) — so the layer would port to eve or the Cloudflare Agents SDK if it ever needed durable, deployed sessions.

### Peer review (orchestrator-worker workflow — predictable path, hardcoded)

<!-- As implemented: query generation per section, both-API search, dedupe vs existing refs,
     LLM relevance judgment with real abstracts in context, claim-citation entailment check,
     confidence surfacing, SSE streaming. -->

### Editing (tool-use agent — unpredictable path)

<!-- As implemented: command → agent loop with typed tools (one per file, eve-style),
     propose_edit emits typed EditOps against the document model, never freeform text. -->

### Citation integrity (the non-negotiable)

The LLM proposes; code enforces; the user approves. `propose_edit` output is validated by a deterministic invariant checker before it can touch the document: the citation multiset must survive every op set (removals only via an explicit user-approved op), and any inserted citation must reference an already-resolved CSL entry. Violations reject the edit with a reason — they are not repairable by prompting because the check is not a prompt.

<!-- As implemented: EditOp types, validator rules, test cases. -->

### External APIs

<!-- As implemented: client design, on-disk cache under data/cache/, rate limits,
     honest empty-result and error states. -->
