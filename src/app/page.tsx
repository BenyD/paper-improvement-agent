import Link from "next/link";
import { UploadDropzone } from "@/features/upload/UploadDropzone";
import { listPapers } from "@/lib/storage/papers";

export default async function Home() {
  const papers = await listPapers();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-6 py-12">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-3xl font-semibold">Paper Improvement Agent</h1>
        <p className="max-w-md text-neutral-500">
          Upload your paper, see how it parses, get a peer review grounded in
          real academic search, and improve it without losing a citation.
        </p>
      </div>
      <UploadDropzone />

      {papers.length > 0 && (
        <section className="w-full max-w-xl">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Previously parsed
          </h2>
          <ul className="flex flex-col divide-y divide-neutral-100 rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
            {papers.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/paper/${p.id}`}
                  className="flex items-baseline justify-between gap-4 px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-900"
                >
                  <span className="truncate text-sm font-medium">
                    {p.title}
                  </span>
                  <span className="shrink-0 text-xs text-neutral-500">
                    {p.referenceCount} refs ·{" "}
                    {new Date(p.uploadedAt).toLocaleDateString()}
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
