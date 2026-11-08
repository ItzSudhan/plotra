import { Icon, type IconName } from "@plotra/icons";
import { KEYS } from "platejs";

export type BlockType = {
  value: string;
  label: string;
  keywords?: string[];
  /** A Solar icon, or a short glyph where Solar has none (headings). */
  icon: IconName | { glyph: string };
  /** Only offered when inserting, not in "Turn into". */
  insertOnly?: boolean;
  /** What to type at the start of a line for this block, when Markdown as you type is on. */
  markdown?: string;
};

export const blockTypes: BlockType[] = [
  { value: KEYS.p, label: "Text", keywords: ["paragraph"], icon: "text-linear" },
  { value: KEYS.h1, label: "Heading 1", keywords: ["title", "h1"], icon: { glyph: "H1" }, markdown: "# " },
  { value: KEYS.h2, label: "Heading 2", keywords: ["subtitle", "h2"], icon: { glyph: "H2" }, markdown: "## " },
  { value: KEYS.h3, label: "Heading 3", keywords: ["h3"], icon: { glyph: "H3" }, markdown: "### " },
  { value: KEYS.ul, label: "Bulleted list", keywords: ["unordered", "ul", "-"], icon: "list-linear", markdown: "- " },
  { value: KEYS.ol, label: "Numbered list", keywords: ["ordered", "ol", "1"], icon: "list-ordered-linear", markdown: "1. " },
  { value: KEYS.listTodo, label: "To-do list", keywords: ["checklist", "task", "[]"], icon: "list-check-linear", markdown: "[] " },
  { value: KEYS.blockquote, label: "Quote", keywords: ["citation", "blockquote", ">"], icon: "quote-linear", markdown: "> " },
  { value: KEYS.callout, label: "Callout", keywords: ["note", "aside"], icon: "lightbulb-linear", insertOnly: true },
  { value: KEYS.table, label: "Table", icon: "table-linear", insertOnly: true },
  { value: KEYS.img, label: "Image", keywords: ["picture", "photo"], icon: "gallery-linear", insertOnly: true },
  { value: KEYS.hr, label: "Divider", keywords: ["hr", "rule", "---", "scene break"], icon: "ruler-linear", insertOnly: true, markdown: "---" },
];

export function BlockTypeIcon({ icon, className }: { icon: BlockType["icon"]; className?: string }) {
  if (typeof icon === "string") return <Icon name={icon} className={className} />;
  return (
    <span aria-hidden className="inline-grid h-4 min-w-4 shrink-0 place-items-center text-meta leading-none font-semibold">
      {icon.glyph}
    </span>
  );
}
