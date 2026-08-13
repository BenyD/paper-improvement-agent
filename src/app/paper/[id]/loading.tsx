import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the workspace shell: document pane left, assistant rail right. */
export default function PaperLoading() {
  return (
    <div className="flex flex-col lg:h-dvh lg:flex-row">
      <main className="min-w-0 flex-1 lg:overflow-y-auto">
        <div className="flex w-full flex-col gap-8 px-4 py-6 sm:px-8 lg:px-10">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-8 w-28 rounded-lg" />
              <div className="flex gap-2">
                <Skeleton className="h-7 w-16 rounded-lg" />
                <Skeleton className="h-7 w-16 rounded-lg" />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Skeleton className="h-9 w-3/4 rounded" />
              <Skeleton className="h-4 w-64 rounded" />
            </div>
          </div>
          <Skeleton className="h-44 w-full rounded-xl" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-48 rounded" />
            {Array.from({ length: 7 }, (_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton list
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-72 rounded" />
            <Skeleton className="h-72 w-full rounded-xl" />
          </div>
        </div>
      </main>
      <aside
        aria-hidden
        className="hidden w-[30rem] shrink-0 flex-col border-l border-border lg:flex"
      >
        <div className="border-b border-border px-4 py-2">
          <Skeleton className="h-8 w-full rounded-lg" />
        </div>
        <div className="flex flex-col gap-3 p-4">
          <Skeleton className="h-3 w-2/3 rounded" />
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-3/4 rounded-xl" />
        </div>
      </aside>
    </div>
  );
}
