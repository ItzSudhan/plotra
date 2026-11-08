import type { usePlateEditor } from "platejs/react";

// Elements that render nested editors (embeds) need plugin
// kits defined in editor-kit.tsx, which itself imports those elements. They
// meet here instead, so neither module imports the other.

export type Kit = NonNullable<NonNullable<Parameters<typeof usePlateEditor>[0]>["plugins"]>;

export const kits: { readOnly: Kit } = { readOnly: [] };
