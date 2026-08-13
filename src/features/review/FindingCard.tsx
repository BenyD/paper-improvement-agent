import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { Finding } from "@/lib/agent/review/types";
import { cn } from "@/lib/utils";

const SEVERITY_STYLES: Record<Finding["severity"], string> = {
  high: "border-red-300 dark:border-red-900",
  medium: "border-amber-300 dark:border-amber-900",
  low: "border-border",
};

export function FindingCard({ finding }: { finding: Finding }) {
  return (
    <Card className={cn("py-4", SEVERITY_STYLES[finding.severity])}>
      <CardContent className="px-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{finding.summary}</span>
          <Badge variant="outline">{finding.severity} severity</Badge>
          <Badge variant="outline">{finding.confidence} confidence</Badge>
        </div>
        <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
          {finding.detail}
        </p>
        <a
          href={finding.source.url}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {finding.source.title}
          {finding.source.year ? ` (${finding.source.year})` : ""}
          {finding.source.authors ? ` — ${finding.source.authors}` : ""}
          <ExternalLink className="size-3.5 shrink-0" aria-hidden />
        </a>
      </CardContent>
    </Card>
  );
}
