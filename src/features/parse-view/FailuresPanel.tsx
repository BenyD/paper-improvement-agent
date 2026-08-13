import { TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { Failure } from "@/lib/failures";

/** Honest surfacing of everything the pipeline could not do. */
export function FailuresPanel({ failures }: { failures: Failure[] }) {
  if (failures.length === 0) return null;
  return (
    <Alert>
      <TriangleAlert aria-hidden />
      <AlertTitle>
        {failures.length} parsing {failures.length === 1 ? "issue" : "issues"}{" "}
        (surfaced, not hidden)
      </AlertTitle>
      <AlertDescription>
        <ul className="flex flex-col gap-1.5">
          {failures.map((f, i) => (
            <li key={`${f.code}-${i}`}>
              <span className="font-mono text-xs">[{f.stage}]</span> {f.message}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
