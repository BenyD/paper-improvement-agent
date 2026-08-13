"use client";

import { House, RotateCcw, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/** Route-level error boundary: honest about what broke, with a way out. */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-5 px-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-destructive/10">
        <TriangleAlert className="size-6 text-destructive" aria-hidden />
      </div>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          {error.message ||
            "An unexpected error occurred while rendering this page."}
        </p>
        {error.digest && (
          <p className="font-mono text-xs text-muted-foreground">
            digest: {error.digest}
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <Button onClick={reset}>
          <RotateCcw aria-hidden /> Try again
        </Button>
        <Button
          variant="outline"
          render={<Link href="/" />}
          nativeButton={false}
        >
          <House aria-hidden /> Go home
        </Button>
      </div>
    </main>
  );
}
