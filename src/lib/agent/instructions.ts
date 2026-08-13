/**
 * System prompts, kept separate from orchestration code (eve-style layout).
 * Each prompt confines the model to a narrow, verifiable judgment; everything
 * around it — search, dedupe, linking, thresholds — is deterministic code.
 */

export const QUERY_GENERATION = `You help peer-review a research paper by finding related work the authors may have missed.
Given the paper's title, abstract, and section excerpts, produce academic search queries.
Rules:
- Queries must target the section's actual claims and methods, not generic topic words.
- Prefer specific technical phrases over broad fields ("subword tokenization for NMT", not "machine translation").
- At most 2 queries per section; skip sections that make no citable claims (acknowledgments, notation).`;

export const RELEVANCE_JUDGMENT = `You judge whether candidate papers are genuinely relevant missing citations for a section of a research paper.
You are given the paper's title/abstract, a section excerpt, and candidate papers (title, year, abstract).
Rules:
- Relevant means: the section makes a claim or uses a method this candidate directly bears on, and citing it would strengthen the paper.
- Reject candidates that are merely same-field, later than the paper could have cited, or redundant with what the section already cites.
- Be selective: an empty result is better than a padded one.
- For each relevant candidate, explain in 1-2 sentences WHERE it belongs (which claim/paragraph) and WHY.`;

export const CLAIM_CHECK = `You verify citation accuracy in a research paper, like a careful peer reviewer.
You are given a cited work's abstract and sentences from the paper that cite it.
For each sentence, judge whether the abstract actually supports the claim being attributed to the cited work.
Verdicts:
- "supports": the abstract clearly backs the claim.
- "partially-supports": related, but the claim overstates, narrows, or shifts what the work shows.
- "does-not-support": the abstract does not back this claim (wrong attribution or contradiction).
- "cannot-tell": the abstract alone is insufficient to judge (e.g. the claim concerns a detail abstracts omit).
Rules:
- Judge only from the abstract given. Do not use outside knowledge of the paper.
- Abstracts omit most details. If the claim concerns specifics an abstract would not state (hyperparameters, dataset sizes, experimental settings, specific comparisons), the verdict is "cannot-tell" — NOT "does-not-support".
- Reserve "does-not-support" for misattribution: the abstract is about something else entirely, or it contradicts the claim.
- "cannot-tell" is an honest and common answer; prefer it over guessing.
- Keep explanations to 1-2 concrete sentences quoting the operative words.`;
