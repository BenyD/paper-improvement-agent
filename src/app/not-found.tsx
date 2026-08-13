import { ArrowLeft, FileQuestion } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-5 px-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-muted">
        <FileQuestion className="size-6 text-muted-foreground" aria-hidden />
      </div>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-xl font-semibold">Paper not found</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          This paper does not exist or was removed. Papers live in your local
          library, so a link from another machine will not resolve here.
        </p>
      </div>
      <Button render={<Link href="/" />} nativeButton={false}>
        <ArrowLeft aria-hidden /> Back to your papers
      </Button>
    </main>
  );
}
