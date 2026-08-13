"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * Shown only when some references are unverified (usually earlier API rate
 * limits). Re-runs verification in place, preserving the document and edits.
 */
export function ReverifyButton({
  paperId,
  unverifiedCount,
}: {
  paperId: string;
  unverifiedCount: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/papers/${paperId}/reverify`, {
        method: "POST",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        healed?: number;
        remaining?: number;
        rateLimited?: boolean;
        error?: string;
      };
      if (!json.ok) {
        toast.error("Re-verification failed", {
          description: json.error ?? "Please try again.",
        });
      } else if ((json.healed ?? 0) > 0) {
        toast.success(
          `Verified ${json.healed} more ${json.healed === 1 ? "entry" : "entries"}`,
          {
            description:
              (json.remaining ?? 0) > 0
                ? `${json.remaining} still unverified.`
                : "All references are now verified.",
          },
        );
        router.refresh();
      } else if (json.rateLimited) {
        toast.warning("Still rate limited", {
          description:
            "The academic APIs refused these lookups. Retrying later picks up exactly where this left off.",
        });
      } else {
        toast.warning("No new matches", {
          description:
            "The remaining entries could not be matched to a known work.",
        });
      }
    } catch {
      toast.error("Re-verification failed", {
        description: "Please try again.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={run} disabled={busy}>
      {busy ? (
        <Loader2 className="animate-spin" aria-hidden />
      ) : (
        <RefreshCw aria-hidden />
      )}
      Retry verification ({unverifiedCount})
    </Button>
  );
}
