"use client";

import { useRouter } from "next/navigation";
import { StaticValue } from "@/components/workflow/static-doc";
import type { DocNode } from "@/lib/doc-index";

/**
 * A note's document in the public reader: the same static rendering as version
 * previews and the Read view, with no editor behind it. `value` was prepared on
 * the server (lib/public-link.ts `prepareValue`), so links between notes are
 * already ordinary links into the reader; `base` is the reader's own path, and
 * a click on one of those stays in this tab instead of opening a new one.
 */
export function PublicDoc({ value, base, format }: { value: DocNode[]; base: string; format?: string }) {
  const router = useRouter();
  return (
    <div
      className="script-doc font-prose text-[17px] leading-relaxed"
      data-script-format={format && format !== "prose" ? format : undefined}
      onClick={(event) => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const href = (event.target as HTMLElement).closest("a")?.getAttribute("href");
        if (!href || !href.startsWith(`${base}/`)) return;
        event.preventDefault();
        router.push(href);
      }}
    >
      <StaticValue value={value} />
    </div>
  );
}
