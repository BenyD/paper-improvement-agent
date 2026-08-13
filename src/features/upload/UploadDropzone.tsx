"use client";

import { FileText, Loader2, UploadCloud } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

type UploadState =
  | { phase: "idle" }
  | { phase: "uploading"; name: string }
  | { phase: "error"; message: string };

export function UploadDropzone() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>({ phase: "idle" });
  const [dragOver, setDragOver] = useState(false);

  const upload = useCallback(
    async (file: File) => {
      setState({ phase: "uploading", name: file.name });
      const body = new FormData();
      body.append("file", file);
      try {
        const res = await fetch("/api/papers", { method: "POST", body });
        const json = await res.json();
        if (!res.ok)
          throw new Error(json.error ?? `Upload failed (${res.status})`);
        router.push(`/paper/${json.id}`);
      } catch (err) {
        setState({
          phase: "error",
          message: err instanceof Error ? err.message : "Upload failed.",
        });
      }
    },
    [router],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) void upload(file);
    },
    [upload],
  );

  const uploading = state.phase === "uploading";

  return (
    <div className="w-full max-w-xl">
      <button
        type="button"
        aria-label="Upload a research paper PDF"
        aria-busy={uploading}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        disabled={uploading}
        className={cn(
          "flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-border px-8 py-14 transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          dragOver && "border-primary bg-primary/5",
          uploading
            ? "cursor-wait opacity-70"
            : "hover:border-muted-foreground/50 hover:bg-muted/40",
        )}
      >
        {uploading ? (
          <>
            <Loader2
              className="size-8 animate-spin text-muted-foreground"
              aria-hidden
            />
            <span className="text-lg font-medium">Parsing {state.name}…</span>
            <span className="text-sm text-muted-foreground">
              Extracting structure, linking citations, and verifying references
              against OpenAlex and Semantic Scholar. Takes about 30 seconds.
            </span>
          </>
        ) : (
          <>
            <UploadCloud className="size-8 text-muted-foreground" aria-hidden />
            <span className="text-lg font-medium">Drop your paper here</span>
            <span className="text-sm text-muted-foreground">
              or click to browse. PDF up to 50 MB, arXiv papers work best.
            </span>
          </>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        aria-hidden
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      {state.phase === "error" && (
        <Alert variant="destructive" className="mt-4">
          <FileText aria-hidden />
          <AlertTitle>Upload failed</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
