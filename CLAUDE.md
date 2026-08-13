# Paper Improvement Agent

Take-home assessment: upload a research paper PDF → parse structure + citations (CSL-JSON) → peer review grounded in Semantic Scholar + OpenAlex → natural-language editing with approval → LaTeX export. Grading order: system design > code quality > UI. Non-negotiable: no hallucinated citations, no silent citation loss.

## Architecture rules

- Core logic lives in `src/lib/**` as framework-agnostic TypeScript modules; Next.js route handlers in `src/app/api/**` are thin adapters. Never put parsing/agent logic in a route or component.
- One canonical citation model: CSL-JSON (`src/lib/csl/types.ts`). Everything (parsed refs, API results) converges to it. Formatting only via citeproc, never string templates.
- The agent layer follows eve-style conventions: one typed tool per file in `src/lib/agent/tools/`, instructions separate from tool code, no single giant prompt.
- Citation invariants are enforced by deterministic code (`src/lib/doc/invariants.ts`), never by prompting. Every edit op is validated before it can be applied.
- Failures are data: unparsed references, empty searches, and low-confidence matches flow to the UI; never silently drop them.

## Next.js conventions (v15+, App Router)

- Fetch and GET route handlers are NOT cached by default in Next 15 — opt in explicitly.
- External API calls (OpenAlex, Semantic Scholar) go through `src/lib/sources/` clients that use `fetch` with `next: { revalidate: 86400 }` (academic metadata is stable) plus an on-disk cache in `data/cache/` so demos work offline and calls stay honest/replayable.
- Anthropic API calls and anything user-specific: `cache: 'no-store'`.
- Server Components by default; `"use client"` only for interactive leaves (upload dropzone, diff approval, chat input).
- Long-running work (review, edits) streams via SSE from route handlers; no polling.

## Code conventions

- TypeScript strict; domain types in `src/lib/*/types.ts`, validated at boundaries with zod.
- Tests with vitest colocated as `*.test.ts` next to the module; parsing pipeline stages each get fixture-based tests.
- Plain conventional commits (feat:, fix:, docs:); no AI attribution trailers.
- No em dashes in user-facing UI copy.

## Run

- `npm run dev` — app on :3000
- `npm test` — vitest
- Requires `ANTHROPIC_API_KEY` in `.env.local` (agent features degrade gracefully without it; parsing works keyless).
