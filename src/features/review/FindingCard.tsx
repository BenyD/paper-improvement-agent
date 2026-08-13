import { ExternalLink, Gauge, PenLine, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Finding } from "@/lib/agent/review/types";
import { cn } from "@/lib/utils";

/** Turn a finding into a ready-to-send editing instruction (≤500 chars). */
export function fixCommandFor(finding: Finding): string {
  const base =
    finding.kind === "claim-mismatch"
      ? `Fix this citation issue: ${finding.summary}. The cited source ("${finding.source.title}") does not fully support the claim - adjust the claim to match what the source shows, or find and cite a source that supports it.`
      : `Add a citation to "${finding.source.title}" where relevant: ${finding.summary}`;
  return base.slice(0, 490);
}

const SEVERITY_STYLES: Record<Finding["severity"], string> = {
  high: "border-red-300 dark:border-red-900",
  medium: "border-amber-300 dark:border-amber-900",
  low: "border-border",
};

const SEVERITY_BADGE: Record<Finding["severity"], string> = {
  high: "bg-destructive/10 text-destructive",
  medium: "bg-(--warning)/10 text-(--warning)",
  low: "bg-muted text-muted-foreground",
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const CONFIDENCE_BADGE: Record<Finding["confidence"], string> = {
  high: "bg-(--success)/10 text-(--success)",
  medium: "bg-(--info)/10 text-(--info)",
  low: "bg-muted text-muted-foreground",
};

export function FindingCard({
  finding,
  onFix,
}: {
  finding: Finding;
  onFix?: (command: string) => void;
}) {
  return (
    <Card className={cn("py-4", SEVERITY_STYLES[finding.severity])}>
      <CardContent className="px-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{finding.summary}</span>
          <Badge className={SEVERITY_BADGE[finding.severity]}>
            <TriangleAlert aria-hidden /> {cap(finding.severity)} severity
          </Badge>
          <Badge className={CONFIDENCE_BADGE[finding.confidence]}>
            <Gauge aria-hidden /> {cap(finding.confidence)} confidence
          </Badge>
        </div>
        <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
          {finding.detail}
        </p>
        <a
          href={finding.source.url}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-block text-sm text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {finding.source.title}
          {finding.source.year ? ` (${finding.source.year})` : ""}
          {finding.source.authors ? `, by ${finding.source.authors}` : ""}
        </a>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {onFix && (
            <Button
              variant="outline"
              size="xs"
              onClick={() => onFix(fixCommandFor(finding))}
            >
              <PenLine aria-hidden /> Fix in editor
            </Button>
          )}
          <Button
            variant="outline"
            size="xs"
            nativeButton={false}
            render={
              <a href={finding.source.url} target="_blank" rel="noreferrer" />
            }
          >
            <ExternalLink aria-hidden /> View source
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
