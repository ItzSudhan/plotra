import type { DocNode } from "@/lib/doc-index";
import "./script.css";

/**
 * A script element outside the editor (Read view, version previews), with the
 * same classes the editor gives it, so script.css lays both out alike.
 */
export function StaticScriptBlock({ block, children }: { block: DocNode; children: React.ReactNode }) {
  return (
    <div
      className={`script-el script-${block.type}`}
      data-align={block.align === "center" ? "center" : undefined}
      data-lyric={block.fountain === "lyric" ? "" : undefined}
    >
      {children}
    </div>
  );
}

/** Two speeches side by side (dual dialogue), each in its own column; script.css sets them. */
export function StaticDualDialogue({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return (
    <div className="script-dual">
      <div className="script-dual-col">{left}</div>
      <div className="script-dual-col">{right}</div>
    </div>
  );
}
