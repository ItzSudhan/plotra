// One of Plotra's own plugins (./index.ts). Plain JavaScript in a string: no backticks or "${" in it.
export const code = String.raw`// ==Plotra plugin==
// @name        Characters in the story
// @description Which characters appear in how many chapters and scenes, and which never do
// @version     1.0
// @access      read
// ==/Plotra plugin==

// Looks each character up by name and aliases with Plotra's search, and counts
// the chapters and scenes that mention them. A name that's also a common word
// ("Hope", "Will") can count more than it should.

const STYLE = "h3{margin:12px 0 6px;font-size:13px}h3:first-of-type{margin-top:0}.muted{color:var(--plotra-muted-foreground);margin:0 0 8px}" +
  "ul{list-style:none;margin:0;padding:0;display:grid;gap:2px}li{display:flex;gap:8px}li button{all:unset;cursor:pointer;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
  "li button:hover{text-decoration:underline}li span{color:var(--plotra-muted-foreground);font-variant-numeric:tabular-nums}" +
  ".again{margin-top:12px;padding:3px 10px;border:1px solid var(--plotra-border);border-radius:6px;background:var(--plotra-secondary);cursor:pointer}";

const LIMIT = 50;
const phrase = (name) => '"' + String(name).replace(/["]/g, " ").trim() + '"';

async function count(character) {
  const seen = new Set();
  for (const name of [character.title].concat(character.aliases || [])) {
    if (!String(name).trim()) continue;
    const hits = await plotra.notes.search(phrase(name), LIMIT);
    for (const hit of hits) if (hit.kind === "chapter" || hit.kind === "scene") seen.add(hit.id);
  }
  return seen.size;
}

function row(character, n) {
  const li = document.createElement("li");
  const open = document.createElement("button");
  open.textContent = character.title || "Unnamed";
  open.title = "Open " + (character.title || "this character");
  open.onclick = () => plotra.ui.openNote(character.id);
  li.append(open);
  if (n !== null) {
    const c = document.createElement("span");
    c.textContent = (n >= LIMIT ? LIMIT + "+" : n) + (n === 1 ? " scene" : " scenes");
    li.append(c);
  }
  return li;
}

async function draw(body) {
  body.replaceChildren();
  const css = document.createElement("style");
  css.textContent = STYLE;
  const status = document.createElement("p");
  status.className = "muted";
  status.textContent = "Looking through your chapters and scenes…";
  body.append(css, status);
  const characters = (await plotra.notes.list()).filter((n) => n.kind === "character" && n.title.trim());
  if (!characters.length) {
    status.textContent = "This project has no characters yet.";
    return;
  }
  const counted = [];
  for (const c of characters) counted.push([c, await count(c)]);
  const never = counted.filter(([, n]) => n === 0);
  const some = counted.filter(([, n]) => n > 0).sort((a, b) => a[1] - b[1] || a[0].title.localeCompare(b[0].title));
  status.textContent = characters.length + (characters.length === 1 ? " character" : " characters") + ", found by name and aliases.";
  const h1 = document.createElement("h3");
  h1.textContent = "Never mentioned (" + never.length + ")";
  const l1 = document.createElement("ul");
  for (const [c] of never) l1.append(row(c, null));
  const h2 = document.createElement("h3");
  h2.textContent = "Mentioned, fewest first";
  const l2 = document.createElement("ul");
  for (const [c, n] of some) l2.append(row(c, n));
  const again = document.createElement("button");
  again.className = "again";
  again.textContent = "Look again";
  again.onclick = () => draw(body);
  body.append(h1, never.length ? l1 : Object.assign(document.createElement("p"), { className: "muted", textContent: "Every character turns up somewhere." }), h2, l2, again);
}

plotra.registerPanel({ id: "cast", title: "Characters in the story", render: draw });
`;
