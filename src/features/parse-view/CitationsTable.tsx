import type { PaperDocument, ReferenceEntry } from "@/lib/doc/types";

function formatAuthors(entry: ReferenceEntry): string {
  const authors = entry.csl.author ?? [];
  if (authors.length === 0) return "—";
  const name = (a: (typeof authors)[number]) => a.family ?? a.literal ?? "?";
  if (authors.length === 1) return name(authors[0]);
  if (authors.length === 2) return `${name(authors[0])} & ${name(authors[1])}`;
  return `${name(authors[0])} et al.`;
}

function ResolutionBadge({ entry }: { entry: ReferenceEntry }) {
  const { resolution } = entry;
  if (resolution.status === "low-confidence") {
    return (
      <a
        href={resolution.url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700 hover:bg-orange-100 dark:bg-orange-950/40 dark:text-orange-400"
        title={resolution.note}
      >
        ≈ low confidence
      </a>
    );
  }
  if (resolution.status === "verified") {
    const label =
      resolution.source === "openalex" ? "OpenAlex" : "Semantic Scholar";
    return (
      <a
        href={resolution.url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400"
        title={`Verified on ${label}${resolution.score ? ` (similarity ${resolution.score.toFixed(2)})` : ""}`}
      >
        ✓ {label}
      </a>
    );
  }
  return (
    <span
      className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
      title={resolution.note}
    >
      unverified
    </span>
  );
}

export function CitationsTable({ doc }: { doc: PaperDocument }) {
  const { entries, markers, citationStyle, entryStyle } = doc.citations;
  const verified = entries.filter(
    (e) => e.resolution.status === "verified",
  ).length;
  const orphans = markers.filter((m) => m.unresolved.length > 0);
  const citedIds = new Set(markers.flatMap((m) => m.targets));

  return (
    <section>
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-neutral-500">
        Citations · {entries.length} references, {verified} verified ·{" "}
        {markers.length} in-text markers
      </h2>
      <p className="mb-3 text-xs text-neutral-500">
        List style: <span className="font-mono">{entryStyle ?? "unknown"}</span>{" "}
        · Citation style: <span className="font-mono">{citationStyle}</span>
        {orphans.length > 0 && (
          <span className="ml-2 text-amber-600 dark:text-amber-400">
            · {orphans.length} orphan markers
          </span>
        )}
      </p>
      <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500 dark:border-neutral-800">
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Authors</th>
              <th className="px-3 py-2 font-medium">Title</th>
              <th className="px-3 py-2 font-medium">Year</th>
              <th className="px-3 py-2 font-medium">Cited</th>
              <th className="px-3 py-2 font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr
                key={entry.id}
                className="border-b border-neutral-100 align-top last:border-0 dark:border-neutral-900"
              >
                <td className="px-3 py-2 font-mono text-xs text-neutral-500">
                  {entry.marker ?? "•"}
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  {formatAuthors(entry)}
                </td>
                <td className="px-3 py-2">
                  <span title={entry.rawText}>
                    {entry.csl.title ?? (
                      <em className="text-neutral-400">no title parsed</em>
                    )}
                  </span>
                </td>
                <td className="px-3 py-2 font-mono text-xs">
                  {entry.csl.issued?.["date-parts"]?.[0]?.[0] ?? "—"}
                </td>
                <td className="px-3 py-2 text-xs text-neutral-500">
                  {citedIds.has(entry.id) ? (
                    markers.filter((m) => m.targets.includes(entry.id)).length
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400">
                      never
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <ResolutionBadge entry={entry} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {orphans.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
          <p className="mb-1 font-semibold">
            Orphan in-text markers (cite nothing in the list):
          </p>
          {orphans.slice(0, 8).map((m) => (
            <p key={m.id} className="font-mono">
              {m.raw} <span className="font-sans">in {m.sectionId}</span>
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
