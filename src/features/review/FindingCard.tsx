import type { Finding } from "@/lib/agent/review/types";

const SEVERITY_STYLES: Record<Finding["severity"], string> = {
  high: "border-red-300 dark:border-red-800",
  medium: "border-amber-300 dark:border-amber-800",
  low: "border-neutral-200 dark:border-neutral-800",
};

export function FindingCard({ finding }: { finding: Finding }) {
  return (
    <div
      className={`rounded-lg border p-4 ${SEVERITY_STYLES[finding.severity]}`}
    >
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{finding.summary}</span>
        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
          {finding.severity} severity
        </span>
        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
          {finding.confidence} confidence
        </span>
      </div>
      <p className="whitespace-pre-line text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
        {finding.detail}
      </p>
      <a
        href={finding.source.url}
        target="_blank"
        rel="noreferrer"
        className="mt-2 inline-block text-sm text-blue-600 hover:underline dark:text-blue-400"
      >
        {finding.source.title}
        {finding.source.year ? ` (${finding.source.year})` : ""}
        {finding.source.authors ? ` — ${finding.source.authors}` : ""} ↗
      </a>
    </div>
  );
}
