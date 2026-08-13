import { ChevronRight, TriangleAlert } from "lucide-react";
import type { Failure } from "@/lib/failures";

/**
 * Contextual issue chips: parsing failures render inside the section they
 * concern (structure issues by the structure tree, marker issues by the
 * citations table) instead of one global alert box. Issues carrying evidence
 * (`context`) expand in place — native details, no client JS.
 */
export function InlineIssues({ failures }: { failures: Failure[] }) {
  if (failures.length === 0) return null;
  return (
    <ul className="mb-3 flex flex-col gap-1.5">
      {failures.map((f, i) =>
        // Expandable only when there is more than the preview can show:
        // a one-line context renders inline, with no chevron lying about
        // hidden content.
        f.context && (f.context.includes("\n") || f.context.length > 90) ? (
          <li
            key={`${f.code}-${i}`}
            className="rounded-lg bg-(--warning)/10 text-sm text-foreground"
          >
            <details className="group">
              <summary className="flex cursor-pointer select-none list-none items-start gap-2 px-3 py-2 [&::-webkit-details-marker]:hidden">
                <TriangleAlert
                  className="mt-0.5 size-3.5 shrink-0 text-(--warning)"
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  {f.message}
                  <span className="block truncate font-mono text-xs text-muted-foreground group-open:hidden">
                    {f.context}
                  </span>
                </span>
                <ChevronRight
                  className="mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
                  aria-hidden
                />
              </summary>
              <p className="whitespace-pre-wrap break-words px-3 pb-2.5 pl-[2.375rem] font-mono text-xs leading-relaxed text-muted-foreground">
                {f.context}
              </p>
            </details>
          </li>
        ) : (
          <li
            key={`${f.code}-${i}`}
            className="flex items-start gap-2 rounded-lg bg-(--warning)/10 px-3 py-2 text-sm text-foreground"
          >
            <TriangleAlert
              className="mt-0.5 size-3.5 shrink-0 text-(--warning)"
              aria-hidden
            />
            <span className="min-w-0 flex-1">
              {f.message}
              {f.context && (
                <span className="block font-mono text-xs text-muted-foreground">
                  {f.context}
                </span>
              )}
            </span>
          </li>
        ),
      )}
    </ul>
  );
}

/** Which UI region a pipeline stage's failures belong to. */
export function issuesFor(
  failures: Failure[],
  region: "structure" | "references" | "citations",
): Failure[] {
  const map: Record<
    Failure["stage"],
    "structure" | "references" | "citations"
  > = {
    extract: "structure",
    structure: "structure",
    "locate-refs": "references",
    segment: "references",
    "parse-entry": "citations",
    "link-markers": "citations",
    resolve: "citations",
  };
  return failures.filter((f) => map[f.stage] === region);
}
