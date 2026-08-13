import { wordDiff } from "@/lib/doc/diff";
import type { EditOp } from "@/lib/doc/ops";
import type { PaperDocument } from "@/lib/doc/types";

function DiffText({ before, after }: { before: string; after: string }) {
  const tokens = wordDiff(before, after);
  return (
    <p className="text-sm leading-relaxed">
      {tokens.map((t, i) =>
        t.type === "same" ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: static diff render
          <span key={i}> {t.text}</span>
        ) : t.type === "add" ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: static diff render
          <ins
            key={i}
            className="rounded-sm bg-emerald-50 px-0.5 text-emerald-900 no-underline dark:bg-emerald-950/60 dark:text-emerald-200"
          >
            {" "}
            {t.text}
          </ins>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: static diff render
          <del
            key={i}
            className="rounded-sm bg-red-50 px-0.5 text-red-800/60 decoration-red-400/50 dark:bg-red-950/40 dark:text-red-300/60 dark:decoration-red-500/40"
          >
            {" "}
            {t.text}
          </del>
        ),
      )}
    </p>
  );
}

export function OpView({ op, doc }: { op: EditOp; doc: PaperDocument }) {
  const section =
    "sectionId" in op
      ? doc.sections.find((s) => s.id === op.sectionId)
      : undefined;
  const label = (text: string) => (
    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
      {text}
    </p>
  );

  switch (op.type) {
    case "replace_paragraph":
      return (
        <div>
          {label(
            `Rewrite paragraph ${op.paragraph + 1} in ${section?.heading ?? op.sectionId}`,
          )}
          <DiffText
            before={section?.paragraphs[op.paragraph] ?? ""}
            after={op.text}
          />
        </div>
      );
    case "insert_paragraph":
      return (
        <div>
          {label(
            `Insert paragraph ${op.afterParagraph < 0 ? "at the start of" : `after paragraph ${op.afterParagraph + 1} in`} ${section?.heading ?? op.sectionId}`,
          )}
          <DiffText before="" after={op.text} />
        </div>
      );
    case "delete_paragraph":
      return (
        <div>
          {label(
            `Delete paragraph ${op.paragraph + 1} in ${section?.heading ?? op.sectionId}`,
          )}
          <DiffText before={section?.paragraphs[op.paragraph] ?? ""} after="" />
        </div>
      );
    case "edit_heading":
      return (
        <div>
          {label("Rename heading")}
          <DiffText before={section?.heading ?? ""} after={op.heading} />
        </div>
      );
    case "replace_abstract":
      return (
        <div>
          {label("Rewrite abstract")}
          <DiffText before={doc.abstract} after={op.text} />
        </div>
      );
    case "add_reference": {
      const year = op.csl.issued?.["date-parts"]?.[0]?.[0];
      return (
        <div>
          {label("Add reference (verified)")}
          <a
            href={op.resolution.url}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-blue-600 hover:underline dark:text-blue-400"
          >
            {op.csl.title}
            {year ? ` (${year})` : ""} ↗
          </a>
        </div>
      );
    }
  }
}
