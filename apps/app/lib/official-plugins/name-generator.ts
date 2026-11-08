// One of Plotra's own plugins (./index.ts). Plain JavaScript in a string: no backticks or "${" in it.
export const code = String.raw`// ==Plotra plugin==
// @name        Name generator
// @description Names for characters in a few styles, made up on the spot; add one to your characters in a click
// @version     1.0
// @access      write
// ==/Plotra plugin==

// Names are put together from syllables, so they're new each time. Adding one
// makes a character note with that name; nothing else is changed.

const STYLES = {
  soft: { label: "Soft and lyrical", start: ["a", "e", "i", "el", "ae", "li", "ma", "ny", "se", "sy", "ta", "ve", "lo", "mi", "ri"], middle: ["la", "ri", "na", "le", "wy", "si", "ne", "ra", "li", "va", "mi", "re"], end: ["a", "ia", "el", "wen", "ys", "ine", "ra", "lie", "na", "eth", "is", "anne"] },
  stern: { label: "Hard and stern", start: ["br", "dr", "gr", "k", "th", "v", "r", "g", "st", "kr", "d", "h"], middle: ["a", "o", "u", "e", "ar", "or", "ul", "ag", "ek", "un"], end: ["k", "rn", "th", "g", "d", "rak", "dun", "mar", "gar", "rik", "vald", "orn"] },
  old: { label: "Old and rustic", start: ["Ed", "Al", "Wil", "God", "Os", "Ath", "Ced", "Leof", "Ælf", "Wyn", "Hild", "Eal"], middle: ["", "", "e", "a", "i"], end: ["ric", "win", "mund", "wyn", "red", "burh", "gar", "stan", "thryth", "wold", "frith", "da"] },
  modern: { label: "Everyday modern", first: ["Ava", "Noah", "Maya", "Leo", "Ivy", "Sam", "Nora", "Eli", "Zoe", "Theo", "Ruby", "Max", "Iris", "Owen", "Lena", "Jude", "Hana", "Cole", "Mira", "Ezra", "Tess", "Ravi", "Ines", "Kai"], last: ["Hart", "Moreno", "Okafor", "Lindqvist", "Patel", "Brennan", "Sato", "Abara", "Vance", "Kowalski", "Reyes", "Holt", "Nakamura", "Fischer", "Quinn", "Mensah", "Doyle", "Ferreira", "Ward", "Haddad"] },
};

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1);

function make(style) {
  const s = STYLES[style];
  if (s.first) return pick(s.first) + " " + pick(s.last);
  const parts = [pick(s.start)];
  if (Math.random() < 0.6) parts.push(pick(s.middle));
  parts.push(pick(s.end));
  return capital(parts.join("").replace(/(.)\1\1+/g, "$1$1"));
}

const STYLE = "h3{margin:0 0 8px;font-size:13px}.bar{display:flex;gap:6px;margin:0 0 10px;flex-wrap:wrap}" +
  "select,button{padding:3px 8px;border:1px solid var(--plotra-border);border-radius:6px;background:var(--plotra-secondary);cursor:pointer}" +
  "ul{list-style:none;margin:0;padding:0;display:grid;gap:4px}li{display:flex;align-items:center;gap:8px}li span{flex:1}" +
  "li button{background:transparent;font-size:12px}li button:disabled{cursor:default;opacity:.6}.muted{color:var(--plotra-muted-foreground)}";

async function draw(body) {
  const saved = await plotra.storage.get("style");
  let style = STYLES[saved] ? saved : "soft";
  body.replaceChildren();
  const css = document.createElement("style");
  css.textContent = STYLE;
  const title = document.createElement("h3");
  title.textContent = "Name generator";
  const bar = document.createElement("div");
  bar.className = "bar";
  const select = document.createElement("select");
  for (const [id, s] of Object.entries(STYLES)) {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = s.label;
    option.selected = id === style;
    select.append(option);
  }
  const again = document.createElement("button");
  again.textContent = "More names";
  bar.append(select, again);
  const list = document.createElement("ul");
  const fill = () => {
    list.replaceChildren();
    const names = new Set();
    while (names.size < 12) names.add(make(style));
    for (const name of names) {
      const li = document.createElement("li");
      const label = document.createElement("span");
      label.textContent = name;
      const add = document.createElement("button");
      add.textContent = "Add as character";
      add.onclick = async () => {
        add.disabled = true;
        try {
          const made = await plotra.notes.create({ title: name, kind: "character" });
          add.textContent = "Added";
          plotra.ui.toast(name + " is in your characters.", "success");
          plotra.ui.openNote(made.id);
        } catch (error) {
          add.disabled = false;
          plotra.ui.toast(String(error.message || error), "error");
        }
      };
      li.append(label, add);
      list.append(li);
    }
  };
  select.onchange = () => {
    style = select.value;
    plotra.storage.set("style", style);
    fill();
  };
  again.onclick = fill;
  const note = document.createElement("p");
  note.className = "muted";
  note.textContent = "Made up from syllables each time, so check a name you like isn't someone famous.";
  body.append(css, title, bar, list, note);
  fill();
}

plotra.registerPanel({ id: "names", title: "Name generator", render: draw });
`;
