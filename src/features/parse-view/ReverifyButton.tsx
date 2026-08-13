"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
  const [note, setNote] = useState("");

  const run = async () => {
    setBusy(true);
    setNote("");
    try {
      const res = await fetch(`/api/papers/${paperId}/reverify`, {
        method: "POST",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        healed?: number;
        remaining?: number;
        error?: string;
      };
      if (!json.ok) {
        setNote(json.error ?? "Re-verification failed.");
      } else if ((json.healed ?? 0) > 0) {
        setNote(
          `Verified ${json.healed} more ${json.healed === 1 ? "entry" : "entries"}.${(json.remaining ?? 0) > 0 ? ` ${json.remaining} still unverified.` : ""}`,
        );
        router.refresh();
      } else {
        setNote(
          "No change. The academic APIs may still be rate-limited, try again later.",
        );
      }
    } catch {
      setNote("Re-verification failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-2">
      <Button variant="outline" size="xs" onClick={run} disabled={busy}>
        {busy ? (
          <Loader2 className="animate-spin" aria-hidden />
        ) : (
          <RefreshCw aria-hidden />
        )}
        Retry verification ({unverifiedCount})
      </Button>
      <output aria-live="polite" className="text-xs text-muted-foreground">
        {note}
      </output>
    </span>
  );
}
