import Link from "next/link";

// The library reads data/papers from disk per request — never prerender it.
export const dynamic = "force-dynamic";

import { UploadDropzone } from "@/features/upload/UploadDropzone";
import { listPapers } from "@/lib/storage/papers";

export default async function Home() {
  const papers = await listPapers();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-10 px-4 py-12 sm:px-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Paper Improvement Agent
        </h1>
        <p className="max-w-md text-balance text-muted-foreground">
          Upload your paper, see how it parses, get a peer review grounded in
          real academic search, and improve it without losing a citation.
        </p>
      </div>

      <UploadDropzone />

      {papers.length > 0 && (
        <section className="w-full max-w-xl" aria-labelledby="library-heading">
          <h2
            id="library-heading"
            className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground"
          >
            Previously parsed
          </h2>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {papers.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/paper/${p.id}`}
                  className="flex items-baseline justify-between gap-4 px-4 py-3 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
                >
                  <span className="truncate text-sm font-medium">
                    {p.title}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {p.referenceCount} refs ·{" "}
                    <time dateTime={p.uploadedAt}>
                      {new Date(p.uploadedAt).toLocaleDateString()}
                    </time>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
