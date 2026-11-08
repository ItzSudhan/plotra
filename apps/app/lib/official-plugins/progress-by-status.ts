// One of Plotra's own plugins (./index.ts). Plain JavaScript in a string: no backticks or "${" in it.
export const code = String.raw`// ==Plotra plugin==
// @name        Progress by status
// @description How much of your draft is at each stage, by chapters, scenes and words
// @version     1.0
// @access      read
// ==/Plotra plugin==

const NAMES = { draft: "Draft", revised: "Revised", final: "Final" };
const STYLE = "h3{margin:0 0 4px;font-size:13px}.muted{color:var(--plotra-muted-foreground);margin:0 0 12px}" +
  ".stack{display:flex;height:10px;border-radius:5px;overflow:hidden;background:var(--plotra-muted);margin:0 0 14px}" +
  "table{width:100%;border-collapse:collapse}th,td{text-align:right;padding:4px 0;font-variant-numeric:tabular-nums}th:first-child,td:first-child{text-align:left}" +
  "th{font-weight:500;color:var(--plotra-muted-foreground)}tr+tr td{border-top:1px solid var(--plotra-border)}.dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px}";
const COLOURS = ["var(--plotra-primary)", "var(--plotra-teal)", "var(--plotra-gold)", "var(--plotra-violet)", "var(--plotra-rose)", "var(--plotra-ember)"];

async function draw(body) {
  const parts = (await plotra.notes.list()).filter((n) => n.kind === "chapter" || n.kind === "scene");
  const groups = new Map();
  let words = 0;
  for (const n of parts) {
    const key = n.status || "";
    const g = groups.get(key) || { chapters: 0, scenes: 0, words: 0 };
    if (n.kind === "chapter") g.chapters++;
    else g.scenes++;
    g.words += n.wordCount;
    words += n.wordCount;
    groups.set(key, g);
  }
  const order = ["", "draft", "revised", "final"];
  const rows = [...groups].sort((a, b) => {
    const i = order.indexOf(a[0]), j = order.indexOf(b[0]);
    return (i < 0 ? 99 : i) - (j < 0 ? 99 : j) || a[0].localeCompare(b[0]);
  });
  body.replaceChildren();
  const css = document.createElement("style");
  css.textContent = STYLE;
  const title = document.createElement("h3");
  title.textContent = "Progress by status";
  const about = document.createElement("p");
  about.className = "muted";
  body.append(css, title, about);
  if (!parts.length) {
    about.textContent = "No chapters or scenes yet.";
    return;
  }
  about.textContent = words.toLocaleString() + " words in " + parts.length + " chapters and scenes.";
  const stack = document.createElement("div");
  stack.className = "stack";
  const table = document.createElement("table");
  const head = document.createElement("tr");
  for (const h of ["Status", "Chapters", "Scenes", "Words"]) head.append(Object.assign(document.createElement("th"), { textContent: h }));
  table.append(head);
  rows.forEach(([status, g], i) => {
    const colour = status ? COLOURS[i % COLOURS.length] : "var(--plotra-muted-foreground)";
    const seg = document.createElement("span");
    seg.style.width = (words ? (g.words / words) * 100 : 0) + "%";
    seg.style.background = colour;
    seg.title = (NAMES[status] || status || "No status") + ": " + g.words.toLocaleString() + " words";
    stack.append(seg);
    const tr = document.createElement("tr");
    const name = document.createElement("td");
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = colour;
    name.append(dot, document.createTextNode(NAMES[status] || status || "No status"));
    tr.append(name);
    for (const v of [g.chapters, g.scenes, g.words]) tr.append(Object.assign(document.createElement("td"), { textContent: v.toLocaleString() }));
    table.append(tr);
  });
  body.append(stack, table);
}

plotra.registerPanel({
  id: "status",
  title: "Progress by status",
  async render(body) {
    await draw(body);
    plotra.on("notes.change", () => draw(body));
  },
});
`;
