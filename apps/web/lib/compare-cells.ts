// The cells of the comparison tables. Kept apart from lib/compare.ts, which
// imports every page's content, so the content can use these without a cycle.

/** A cell in the side-by-side: yes, no, partly, or words. */
export type Cell = { mark?: "yes" | "no" | "part"; text?: string };

export const yes = (text?: string): Cell => ({ mark: "yes", text });
export const no = (text?: string): Cell => ({ mark: "no", text });
export const part = (text: string): Cell => ({ mark: "part", text });
export const say = (text: string): Cell => ({ text });
