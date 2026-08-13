"use client";

import {
  ChevronDown,
  Download,
  FileCode,
  FileText,
  FileType,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { PaperDocument } from "@/lib/doc/types";

/** One export button, formats in a menu. Bibliography rendered via CSL;
 *  the detected style is the default, with an explicit CSL style pick. */
export function ExportActions({ doc }: { doc: PaperDocument }) {
  const [style, setStyle] = useState("detected");
  const styleQuery = style === "detected" ? "" : `&style=${style}`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm">
            <Download aria-hidden /> Export <ChevronDown aria-hidden />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            Structure, edits and all {doc.citations.entries.length} references
            survive the round trip
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="items-start"
          render={
            <a
              href={`/api/papers/${doc.id}/export?format=tex${styleQuery}`}
              download
            />
          }
        >
          <FileCode className="mt-0.5" aria-hidden />
          <div className="flex flex-col">
            <span>LaTeX source (.tex)</span>
            <span className="text-xs text-muted-foreground">
              Compilable, CSL-rendered bibliography
            </span>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="items-start"
          render={
            <a href={`/api/papers/${doc.id}/export?format=bib`} download />
          }
        >
          <FileText className="mt-0.5" aria-hidden />
          <div className="flex flex-col">
            <span>BibTeX (.bib)</span>
            <span className="text-xs text-muted-foreground">
              References as citable data
            </span>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="items-start"
          render={
            <a
              href={`/api/papers/${doc.id}/export?format=md${styleQuery}`}
              download
            />
          }
        >
          <FileType className="mt-0.5" aria-hidden />
          <div className="flex flex-col">
            <span>Markdown (.md)</span>
            <span className="text-xs text-muted-foreground">
              Structured document with real tables
            </span>
          </div>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Citation style</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={style} onValueChange={setStyle}>
            <DropdownMenuRadioItem value="detected" closeOnClick={false}>
              Detected (default)
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="apa" closeOnClick={false}>
              APA
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="vancouver" closeOnClick={false}>
              Vancouver
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="harvard1" closeOnClick={false}>
              Harvard
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
