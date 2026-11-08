// One of Plotra's own plugins (./index.ts). Plain JavaScript in a string: no backticks or "${" in it.
export const code = String.raw`// ==Plotra plugin==
// @name        Word count by chapter
// @description Words in each chapter, with its scenes, in a panel that keeps up as you write
// @version     1.0
// @access      read
// ==/Plotra plugin==

const STYLE = "h3{margin:0 0 2px;font-size:13px}.total{color:var(--plotra-muted-foreground);margin:0 0 12px}" +
  "ol{list-style:none;margin:0;padding:0;display:grid;gap:6px}button{all:unset;cursor:pointer;display:grid;gap:3px;width:100%}" +
  "button:hover .name{text-decoration:underline}.row{display:flex;gap:8px}.name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
  ".count{color:var(--plotra-muted-foreground);font-variant-numeric:tabular-nums}.bar{height:4px;border-radius:2px;background:var(--plotra-muted)}" +
  ".bar span{display:block;height:100%;border-radius:2px;background:var(--plotra-primary)}.empty{color:var(--plotra-muted-foreground)}";

async function draw(body) {
  const notes = await plotra.notes.list();
  const byId = new Map(notes.map((n) => [n.id, n]));
  const chapterOf = (note) => {
    for (let at = note; at; at = at.parentId ? byId.get(at.parentId) : null) if (at.kind === "chapter") return at;
    return null;
  };
  const rows = [];
  const totals = new Map();
  let loose = 0;
  let all = 0;
  for (const note of notes) {
    if (note.kind !== "chapter" && note.kind !== "scene") continue;
    all += note.wordCount;
    const chapter = chapterOf(note);
    if (!chapter) { loose += note.wordCount; continue; }
    if (!totals.has(chapter.id)) { totals.set(chapter.id, 0); rows.push(chapter); }
    totals.set(chapter.id, totals.get(chapter.id) + note.wordCount);
  }
  const most = Math.max(1, ...totals.values());

  body.replaceChildren();
  const style = document.createElement("style");
  style.textContent = STYLE;
  const title = document.createElement("h3");
  title.textContent = "Word count by chapter";
  const total = document.createElement("p");
  total.className = "total";
  total.textContent = all.toLocaleString() + " words in " + rows.length + (rows.length === 1 ? " chapter" : " chapters") + (loose ? ", and " + loose.toLocaleString() + " in scenes outside one" : "");
  body.append(style, title, total);
  if (!rows.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No chapters yet. Add one in the binder and its words show here.";
    body.append(empty);
    return;
  }
  const list = document.createElement("ol");
  rows.forEach((chapter, i) => {
    const words = totals.get(chapter.id);
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.title = "Open " + (chapter.title || "this chapter");
    button.onclick = () => plotra.ui.openNote(chapter.id);
    const row = document.createElement("span");
    row.className = "row";
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = (i + 1) + ". " + (chapter.title || "Untitled");
    const count = document.createElement("span");
    count.className = "count";
    count.textContent = words.toLocaleString();
    row.append(name, count);
    const bar = document.createElement("span");
    bar.className = "bar";
    const fill = document.createElement("span");
    fill.style.width = Math.round((words / most) * 100) + "%";
    bar.append(fill);
    button.append(row, bar);
    item.append(button);
    list.append(item);
  });
  body.append(list);
}

plotra.registerPanel({
  id: "chapters",
  title: "Word count by chapter",
  async render(body) {
    await draw(body);
    plotra.on("notes.change", () => draw(body));
  },
});
`;
