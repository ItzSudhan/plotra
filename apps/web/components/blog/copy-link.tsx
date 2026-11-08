"use client";

import { useEffect, useState } from "react";
import { Icon } from "@plotra/icons";

/** Puts the page's address on the clipboard, and says so for a moment. */
export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <button
      type="button"
      onClick={() => navigator.clipboard?.writeText(url).then(() => setCopied(true), () => {})}
      className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-3 py-1 text-[13px] text-gray transition-colors hover:border-black/15 hover:text-black"
    >
      <Icon name={copied ? "check-circle-linear" : "link-linear"} className={copied ? "text-teal" : undefined} />
      <span aria-live="polite">{copied ? "Link copied" : "Copy link"}</span>
    </button>
  );
}
