import { Skeleton } from "@/components/ui/skeleton";

export default function PaperLoading() {
  return (
    <main className="min-h-screen">
      <nav className="border-b border-border px-6 py-3">
        <Skeleton className="h-5 w-40 rounded" />
      </nav>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-56 rounded" />
          <Skeleton className="h-8 w-3/4 rounded" />
        </div>
        <Skeleton className="h-40 w-full rounded-xl" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-44 rounded" />
          {Array.from({ length: 6 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton list
            <Skeleton key={i} className="h-10 w-full rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    </main>
  );
}
