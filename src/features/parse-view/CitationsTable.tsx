import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  if (resolution.status === "verified") {
    const label =
      resolution.source === "openalex" ? "OpenAlex" : "Semantic Scholar";
    return (
      <Badge
        className="bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-950 dark:text-emerald-300"
        render={
          <a
            href={resolution.url}
            target="_blank"
            rel="noreferrer"
            title={`Verified on ${label}${resolution.score ? ` (similarity ${resolution.score.toFixed(2)})` : ""}`}
          />
        }
      >
        ✓ {label}
      </Badge>
    );
  }
  if (resolution.status === "low-confidence") {
    return (
      <Badge
        className="bg-orange-100 text-orange-800 hover:bg-orange-200 dark:bg-orange-950 dark:text-orange-300"
        render={
          <a
            href={resolution.url}
            target="_blank"
            rel="noreferrer"
            title={resolution.note}
          />
        }
      >
        ≈ low confidence
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" title={resolution.note}>
      unverified
    </Badge>
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
    <section aria-labelledby="citations-heading">
      <h2
        id="citations-heading"
        className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground"
      >
        Citations · {entries.length} references, {verified} verified ·{" "}
        {markers.length} in-text markers
      </h2>
      <p className="mb-3 text-xs text-muted-foreground">
        List style: <span className="font-mono">{entryStyle ?? "unknown"}</span>{" "}
        · Citation style: <span className="font-mono">{citationStyle}</span>
        {orphans.length > 0 && (
          <span className="ml-2 text-amber-600 dark:text-amber-400">
            · {orphans.length} orphan markers
          </span>
        )}
      </p>
      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              <TableHead>Authors</TableHead>
              <TableHead className="min-w-48">Title</TableHead>
              <TableHead>Year</TableHead>
              <TableHead>Cited</TableHead>
              <TableHead>Source</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {entry.marker ?? "•"}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {formatAuthors(entry)}
                </TableCell>
                <TableCell className="max-w-md">
                  <span title={entry.rawText}>
                    {entry.csl.title ?? (
                      <em className="text-muted-foreground">no title parsed</em>
                    )}
                  </span>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {entry.csl.issued?.["date-parts"]?.[0]?.[0] ?? "—"}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {citedIds.has(entry.id) ? (
                    markers.filter((m) => m.targets.includes(entry.id)).length
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400">
                      never
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <ResolutionBadge entry={entry} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {orphans.length > 0 && (
        <Alert className="mt-3">
          <AlertTitle>
            Orphan in-text markers (cite nothing in the list)
          </AlertTitle>
          <AlertDescription>
            {orphans.slice(0, 8).map((m) => (
              <p key={m.id} className="font-mono text-xs">
                {m.raw} <span className="font-sans">in {m.sectionId}</span>
                {m.unresolved[0]?.includes("ambiguous") && (
                  <span className="font-sans"> — {m.unresolved[0]}</span>
                )}
              </p>
            ))}
          </AlertDescription>
        </Alert>
      )}
    </section>
  );
}
