import type { Failure } from "@/lib/failures";

/** Honest surfacing of everything the pipeline could not do. */
export function FailuresPanel({ failures }: { failures: Failure[] }) {
  if (failures.length === 0) return null;
  return (
    <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950/30">
      <h2 className="mb-2 text-sm font-semibold text-amber-800 dark:text-amber-400">
        {failures.length} parsing {failures.length === 1 ? "issue" : "issues"}
      </h2>
      <ul className="flex flex-col gap-1.5">
        {failures.map((f, i) => (
          <li
            key={`${f.code}-${i}`}
            className="text-sm text-amber-900 dark:text-amber-300"
          >
            <span className="font-mono text-xs">[{f.stage}]</span> {f.message}
          </li>
        ))}
      </ul>
    </section>
  );
}
