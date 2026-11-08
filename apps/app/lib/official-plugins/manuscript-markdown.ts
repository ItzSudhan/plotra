// One of Plotra's own plugins (./index.ts). Plain JavaScript in a string: no backticks or "${" in it.
export const code = String.raw`// ==Plotra plugin==
// @name        Manuscript as Markdown
// @description Your chapters and scenes, in binder order, as one Markdown file to edit or convert anywhere
// @version     1.0
// @access      read
// ==/Plotra plugin==

// Each chapter becomes a heading with its own text; its scenes follow,
// with a scene break between them. Scenes outside a chapter come in where
// they sit in the binder. Folders, notes and world entries are left out.

const BREAK = "* * *";

/** Drops a heading at the very top that only repeats the title. */
const body = (markdown, title) => {
  const text = String(markdown || "").trim();
  const first = text.split("\n", 1)[0];
  const match = /^#{1,6}\s+(.*)$/.exec(first);
  return match && match[1].trim() === String(title).trim() ? text.slice(first.length).trim() : text;
};

plotra.registerExport({
  id: "manuscript",
  title: "Manuscript (Markdown)",
  extension: "md",
  async run() {
    const parts = (await plotra.notes.list()).filter((n) => n.kind === "chapter" || n.kind === "scene");
    if (!parts.length) throw new Error("This project has no chapters or scenes yet.");
    if (parts.length > 400) plotra.ui.toast("Gathering " + parts.length + " chapters and scenes. This takes a minute or two.");
    const out = ["# " + plotra.project.title, ""];
    let sceneBefore = false;
    // Plugins may make 600 calls a minute; a long book is read a little slower.
    const pause = parts.length > 500 ? 110 : 0;
    for (const part of parts) {
      if (pause) await new Promise((done) => setTimeout(done, pause));
      const note = await plotra.notes.read(part.id);
      const text = body(note.markdown, note.title);
      if (part.kind === "chapter") {
        out.push("## " + (note.title || "Untitled"), "");
        if (text) out.push(text, "");
        sceneBefore = Boolean(text);
      } else if (text) {
        if (sceneBefore) out.push(BREAK, "");
        out.push(text, "");
        sceneBefore = true;
      }
    }
    return { content: out.join("\n").replace(/\n{3,}/g, "\n\n"), type: "text/markdown" };
  },
});
`;
