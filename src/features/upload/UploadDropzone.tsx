"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";

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

  return (
    <div className="w-full max-w-xl">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        disabled={state.phase === "uploading"}
        className={`flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-8 py-16 transition-colors ${
          dragOver
            ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
            : "border-neutral-300 dark:border-neutral-700"
        } ${state.phase === "uploading" ? "opacity-60" : "hover:border-neutral-400 dark:hover:border-neutral-500"}`}
      >
        {state.phase === "uploading" ? (
          <>
            <span className="text-lg font-medium">Parsing {state.name}...</span>
            <span className="text-sm text-neutral-500">
              Extracting structure and locating references
            </span>
          </>
        ) : (
          <>
            <span className="text-lg font-medium">Drop your paper here</span>
            <span className="text-sm text-neutral-500">
              PDF up to 50 MB. arXiv papers work great.
            </span>
          </>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      {state.phase === "error" && (
        <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {state.message}
        </p>
      )}
    </div>
  );
}
