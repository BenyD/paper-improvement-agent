"use client";

import { ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Expand/collapse every section at once, so the structure tree can read as
 * a continuous document. The <details> elements are uncontrolled (native),
 * so toggling their `open` attribute directly is safe — React does not
 * manage it.
 */
export function StructureToggle() {
  const [expanded, setExpanded] = useState(false);

  const toggle = () => {
    const next = !expanded;
    for (const d of document.querySelectorAll<HTMLDetailsElement>(
      "section[aria-labelledby='structure-heading'] details",
    )) {
      d.open = next;
    }
    setExpanded(next);
  };

  return (
    <Button
      variant="ghost"
      size="xs"
      onClick={toggle}
      className="text-muted-foreground"
    >
      {expanded ? (
        <ChevronsDownUp aria-hidden />
      ) : (
        <ChevronsUpDown aria-hidden />
      )}
      {expanded ? "Collapse all" : "Expand all"}
    </Button>
  );
}
