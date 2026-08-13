import {
  BadgeCheck,
  BookMarked,
  CircleAlert,
  CircleHelp,
  ExternalLink,
} from "lucide-react";
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
import { InlineIssues, issuesFor } from "./InlineIssues";
import { ReverifyButton } from "./ReverifyButton";

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
        className="bg-emerald-100 text-emerald-800 [a]:hover:bg-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:[a]:hover:bg-emerald-900"
        render={
          <a
            href={resolution.url}
            target="_blank"
            rel="noreferrer"
            title={`Verified on ${label}${resolution.score ? ` (similarity ${resolution.score.toFixed(2)})` : ""}`}
          />
        }
      >
        <BadgeCheck aria-hidden /> {label}{" "}
        <ExternalLink className="size-3" aria-hidden />
      </Badge>
    );
  }
  if (resolution.status === "low-confidence") {
    return (
      <Badge
        className="bg-orange-100 text-orange-800 [a]:hover:bg-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:[a]:hover:bg-orange-900"
        render={
          <a
            href={resolution.url}
            target="_blank"
            rel="noreferrer"
            title={resolution.note}
          />
        }
      >
        <CircleAlert aria-hidden /> low confidence{" "}
        <ExternalLink className="size-3" aria-hidden />
      </Badge>
    );
  }
  // Icon-only: "unverified" repeated down a column is noise. The tooltip
  // carries the specific reason; the label stays for screen readers.
  return (
    <Badge variant="secondary" title={resolution.note ?? "Unverified"}>
      <CircleHelp aria-hidden />
      <span className="sr-only">unverified</span>
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
      <div className="mb-3 flex flex-col gap-2">
        <h2
          id="citations-heading"
          className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground"
        >
          <BookMarked className="size-4" aria-hidden />
          Citations
        </h2>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline">{entries.length} references</Badge>
          <Badge className="bg-(--success)/10 text-(--success)">
            <BadgeCheck aria-hidden /> {verified} verified
          </Badge>
          <Badge variant="outline">{markers.length} in-text markers</Badge>
          {orphans.length > 0 && (
            <Badge className="bg-(--warning)/10 text-(--warning)">
              <CircleAlert aria-hidden /> {orphans.length} orphan
              {orphans.length === 1 ? "" : "s"}
            </Badge>
          )}
          <Badge variant="secondary" className="font-mono text-[11px]">
            {entryStyle ?? "unknown"} / {citationStyle}
          </Badge>
        </div>
      </div>
      <InlineIssues failures={issuesFor(doc.failures, "citations")} />
      {entries.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-10 text-center">
          <BookMarked className="size-5 text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium">No reference entries parsed</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            The reference list could not be segmented from this PDF, so there is
            nothing to verify yet. The issues above explain what the parser saw.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="w-10">#</TableHead>
                <TableHead className="hidden sm:table-cell">Authors</TableHead>
                <TableHead className="min-w-48">Title</TableHead>
                <TableHead className="w-14">Year</TableHead>
                <TableHead className="hidden w-14 md:table-cell">
                  Cited
                </TableHead>
                <TableHead>Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {entry.marker ?? "•"}
                  </TableCell>
                  <TableCell className="hidden max-w-40 truncate whitespace-nowrap sm:table-cell">
                    {formatAuthors(entry)}
                  </TableCell>
                  <TableCell className="max-w-md">
                    <span className="line-clamp-2" title={entry.rawText}>
                      {entry.csl.title ?? (
                        <em className="text-muted-foreground">
                          no title parsed
                        </em>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {entry.csl.issued?.["date-parts"]?.[0]?.[0] ?? "—"}
                  </TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
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
      )}
      {entries.length > 0 && entries.length - verified > 0 && (
        <div className="mt-3">
          <ReverifyButton
            paperId={doc.id}
            unverifiedCount={entries.length - verified}
          />
        </div>
      )}
    </section>
  );
}
