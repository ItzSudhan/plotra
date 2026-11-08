// One of Plotra's own plugins (./index.ts). Plain JavaScript in a string: no backticks or "${" in it.
export const code = String.raw`// ==Plotra plugin==
// @name        Tags overview
// @description Every tag in the project with how often it's used; pick one to see its notes
// @version     1.0
// @access      read
// ==/Plotra plugin==

const STYLE = "h3{margin:0 0 8px;font-size:13px}.muted{color:var(--plotra-muted-foreground);margin:0 0 8px}" +
  ".tags{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 14px}.tags button{padding:2px 9px;border:1px solid var(--plotra-border);border-radius:999px;background:transparent;cursor:pointer}" +
  ".tags button[aria-pressed=true]{background:var(--plotra-primary);color:var(--plotra-primary-foreground);border-color:transparent}.tags small{opacity:.7;margin-left:4px}" +
  "ul{list-style:none;margin:0;padding:0;display:grid;gap:2px}li button{all:unset;cursor:pointer}li button:hover{text-decoration:underline}li small{color:var(--plotra-muted-foreground);margin-left:6px}";

let chosen = null;

async function draw(body) {
  const notes = await plotra.notes.list();
  const counts = new Map();
  for (const n of notes) for (const tag of n.tags || []) counts.set(tag, (counts.get(tag) || 0) + 1);
  if (chosen && !counts.has(chosen)) chosen = null;
  body.replaceChildren();
  const css = document.createElement("style");
  css.textContent = STYLE;
  const title = document.createElement("h3");
  title.textContent = "Tags";
  body.append(css, title);
  if (!counts.size) {
    body.append(Object.assign(document.createElement("p"), { className: "muted", textContent: "No tags yet. Add some to a note's details and they show here." }));
    return;
  }
  const cloud = document.createElement("div");
  cloud.className = "tags";
  for (const [tag, n] of [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    const b = document.createElement("button");
    b.setAttribute("aria-pressed", String(tag === chosen));
    b.append(document.createTextNode(tag), Object.assign(document.createElement("small"), { textContent: String(n) }));
    b.onclick = () => {
      chosen = tag === chosen ? null : tag;
      draw(body);
    };
    cloud.append(b);
  }
  body.append(cloud);
  if (!chosen) {
    body.append(Object.assign(document.createElement("p"), { className: "muted", textContent: "Pick a tag to see the notes that have it." }));
    return;
  }
  const list = document.createElement("ul");
  for (const n of notes.filter((n) => (n.tags || []).includes(chosen))) {
    const li = document.createElement("li");
    const open = document.createElement("button");
    open.textContent = n.title || "Untitled";
    open.onclick = () => plotra.ui.openNote(n.id);
    li.append(open, Object.assign(document.createElement("small"), { textContent: n.kind }));
    list.append(li);
  }
  body.append(list);
}

plotra.registerPanel({
  id: "tags",
  title: "Tags overview",
  async render(body) {
    await draw(body);
    plotra.on("notes.change", () => draw(body));
  },
});
`;
