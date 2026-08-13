import { UploadDropzone } from "@/features/upload/UploadDropzone";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-3xl font-semibold">Paper Improvement Agent</h1>
        <p className="max-w-md text-neutral-500">
          Upload your paper, see how it parses, get a peer review grounded in
          real academic search, and improve it without losing a citation.
        </p>
      </div>
      <UploadDropzone />
    </main>
  );
}
