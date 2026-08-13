import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const CACHE_DIR = path.join(process.cwd(), "data", "cache");

export class SourceError extends Error {
  constructor(
    public readonly source: string,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
  }
}

/**
 * Per-host minimum request spacing. Semantic Scholar's unauthenticated pool is
 * ~1 req/s and 429s aggressively; OpenAlex allows ~10 req/s but dislikes
 * bursts. The disk cache absorbs repeats, so throttling only costs on misses.
 */
const HOST_SPACING_MS: Record<string, number> = {
  "api.semanticscholar.org": 1100,
  // Search endpoints are billed heavier than lookups in OpenAlex's credit
  // pool — pace them to survive bursts (e.g. repeated review runs).
  "api.openalex.org": 400,
};

const hostQueues = new Map<string, Promise<unknown>>();

/**
 * Live activity feed: one subscriber (the running review) receives low-level
 * request events so the UI can narrate waits instead of appearing hung.
 * Single-subscriber by design — one interactive run at a time locally.
 */
let activityListener: ((message: string) => void) | null = null;
export function onSourceActivity(fn: (message: string) => void): () => void {
  activityListener = fn;
  return () => {
    if (activityListener === fn) activityListener = null;
  };
}
const activity = (message: string) => activityListener?.(message);

/**
 * Rate-limit circuit breaker: after a host answers 429 to every attempt of a
 * request, further calls to it fail fast for a cooldown instead of grinding
 * through backoff per query. Callers already treat SourceError as an honest
 * "could not verify/search" note, and checkpoint/resume or Retry verification
 * fill the gap once the pool recovers.
 */
const BREAKER_THRESHOLD = 3;
const BREAKER_COOLDOWN_MS = 90_000;
const breaker = new Map<string, { consecutive: number; openUntil: number }>();

function breakerState(host: string) {
  let s = breaker.get(host);
  if (!s) {
    s = { consecutive: 0, openUntil: 0 };
    breaker.set(host, s);
  }
  return s;
}

const shortHost = (host: string) =>
  host.includes("semanticscholar")
    ? "Semantic Scholar"
    : host.includes("openalex")
      ? "OpenAlex"
      : host;

function throttledByHost<T>(host: string, fn: () => Promise<T>): Promise<T> {
  const spacing = HOST_SPACING_MS[host] ?? 0;
  const prev = hostQueues.get(host) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  hostQueues.set(
    host,
    run.then(
      () => new Promise((r) => setTimeout(r, spacing)),
      () => new Promise((r) => setTimeout(r, spacing)),
    ),
  );
  return run;
}

const MAX_ATTEMPTS = 3;

/**
 * Disk-cached, host-throttled JSON GET with backoff on 429/5xx. Academic
 * metadata is stable, so hits are served from data/cache/ indefinitely —
 * reproducible demos, fewer API calls. Errors throw SourceError with the real
 * status; callers turn that into an honest "could not verify" state, never a
 * fabricated result.
 */
export async function cachedFetchJson(
  url: string,
  headers: Record<string, string> = {},
  post?: { body: unknown },
): Promise<unknown> {
  const key = createHash("sha1")
    .update(url + (post ? JSON.stringify(post.body) : ""))
    .digest("hex");
  const file = path.join(CACHE_DIR, `${key}.json`);

  try {
    const hit = JSON.parse(await readFile(file, "utf8")) as {
      url: string;
      body: unknown;
    };
    return hit.body;
  } catch {
    // miss — fall through to the network
  }

  const host = new URL(url).hostname;
  const name = shortHost(host);
  const state = breakerState(host);
  if (Date.now() < state.openUntil) {
    activity(`${name}: rate limited, skipping calls briefly`);
    throw new SourceError(
      host,
      "rate-limited (skipped: repeated HTTP 429, cooling down)",
      429,
    );
  }

  const query = new URL(url).searchParams.get("query");
  const body = await throttledByHost(host, async () => {
    let lastError: SourceError | null = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      activity(
        query ? `${name}: searching "${query}"` : `${name}: fetching records`,
      );
      let res: Response;
      try {
        res = await fetch(url, {
          headers: post
            ? { ...headers, "Content-Type": "application/json" }
            : headers,
          method: post ? "POST" : "GET",
          body: post ? JSON.stringify(post.body) : undefined,
          cache: "no-store",
        });
      } catch (err) {
        throw new SourceError(
          host,
          `Network error: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      if (res.ok) {
        state.consecutive = 0;
        return (await res.json()) as unknown;
      }

      if (res.status === 429) {
        state.consecutive++;
        if (state.consecutive >= BREAKER_THRESHOLD) {
          state.openUntil = Date.now() + BREAKER_COOLDOWN_MS;
        }
      }
      lastError = new SourceError(
        host,
        res.status === 429 ? `rate-limited (HTTP 429)` : `HTTP ${res.status}`,
        res.status,
      );
      const retryable = res.status === 429 || res.status >= 500;
      if (
        !retryable ||
        attempt === MAX_ATTEMPTS ||
        Date.now() < state.openUntil
      )
        throw lastError;
      const waitMs = 2500 * attempt + Math.random() * 1000;
      activity(
        `${name}: rate limited, retrying in ${Math.round(waitMs / 1000)}s (attempt ${attempt + 1}/${MAX_ATTEMPTS})`,
      );
      await new Promise((r) => setTimeout(r, waitMs));
    }
    throw lastError ?? new SourceError(host, "unreachable");
  });

  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(
    file,
    JSON.stringify({ url, fetchedAt: new Date().toISOString(), body }),
  );
  return body;
}
