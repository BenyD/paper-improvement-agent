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

<!-- Per stage, as implemented: the IR type, the algorithm, the failure modes, a fixture example. -->

### Where CSL-JSON fits

One canonical model: every citation — parsed from the PDF or fetched from an API — converges to CSL-JSON. Rendering (bibliography, inserted citations) goes exclusively through citeproc with a .csl style; the paper's style is detected in P6 (fallback: user choice). No hand-rolled citation formatting anywhere.

### Style and failure handling

<!-- Styles supported, detection algorithm, what happens to unparseable entries end-to-end. -->

## 2. The agent: peer review + natural-language editing

Design follows Anthropic's "Building Effective Agents": the predictable path is a hardcoded workflow, the unpredictable one is a small tool-use agent, and the safety property is enforced by deterministic code rather than prompts.

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
