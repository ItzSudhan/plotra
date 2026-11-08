// One of Plotra's own plugins (./index.ts). Plain JavaScript in a string: no backticks or "${" in it.
export const code = String.raw`// ==Plotra plugin==
// @name        Repeated words
// @description The words and phrases you lean on in the note you have open, and the filler words to cut
// @version     1.0
// @access      read
// ==/Plotra plugin==

const COMMON = new Set(("a about above after again against all am an and any are as at be because been before being below between both but by " +
  "can could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself " +
  "just me more most my myself no nor not now of off on once only or other our ours ourselves out over own same she should so some such than that the their theirs " +
  "them themselves then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your " +
  "yours yourself yourselves said says like back one two get got go went come came know knew see saw").split(" "));
const FILLER = ["just", "really", "very", "suddenly", "quite", "rather", "somehow", "actually", "basically", "literally", "almost", "simply", "totally", "began to", "started to", "seemed to"];

const STYLE = "h3{margin:12px 0 6px;font-size:13px}h3:first-of-type{margin-top:0}.muted{color:var(--plotra-muted-foreground);margin:0 0 8px}" +
  "ul{list-style:none;margin:0;padding:0;display:grid;gap:2px}li{display:flex;justify-content:space-between;gap:8px}" +
  "li span:last-child{color:var(--plotra-muted-foreground);font-variant-numeric:tabular-nums}";

function analyse(text) {
  const words = (text.toLowerCase().match(/[\p{L}][\p{L}'’-]*/gu) || []).map((w) => w.replace(/['’]s$/, ""));
  const counts = new Map();
  for (const w of words) if (w.length > 2 && !COMMON.has(w)) counts.set(w, (counts.get(w) || 0) + 1);
  const phrases = new Map();
  for (let i = 0; i + 2 < words.length; i++) {
    const three = words.slice(i, i + 3);
    if (three.every((w) => COMMON.has(w))) continue;
    const key = three.join(" ");
    phrases.set(key, (phrases.get(key) || 0) + 1);
  }
  const joined = " " + words.join(" ") + " ";
  const filler = FILLER.map((f) => [f, joined.split(" " + f + " ").length - 1]).filter(([, n]) => n > 0);
  const top = (map, min) => [...map].filter(([, n]) => n >= min).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 20);
  return { total: words.length, words: top(counts, 3), phrases: top(phrases, 2).slice(0, 10), filler: filler.sort((a, b) => b[1] - a[1]) };
}

function list(rows, empty) {
  if (!rows.length) {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = empty;
    return p;
  }
  const ul = document.createElement("ul");
  for (const [text, n] of rows) {
    const li = document.createElement("li");
    const a = document.createElement("span");
    a.textContent = text;
    const b = document.createElement("span");
    b.textContent = n + "×";
    li.append(a, b);
    ul.append(li);
  }
  return ul;
}

let shown = null;

async function draw(body) {
  const id = await plotra.notes.active();
  shown = id;
  body.replaceChildren();
  const style = document.createElement("style");
  style.textContent = STYLE;
  body.append(style);
  const note = id ? await plotra.notes.read(id).catch(() => null) : null;
  if (!note || note.markdown == null) {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = "Open a chapter, scene or note to see the words it repeats.";
    body.append(p);
    return;
  }
  const text = note.markdown.replace(/\[\[([^\]|]*)(\|[^\]]*)?\]\]/g, "$1").replace(/[#*_>\[\]()]/g, " ");
  const found = analyse(text);
  const title = document.createElement("h3");
  title.textContent = note.title || "Untitled";
  const about = document.createElement("p");
  about.className = "muted";
  about.textContent = found.total.toLocaleString() + " words. Common words like “the” and “said” are left out.";
  const h1 = document.createElement("h3");
  h1.textContent = "Words used most";
  const h2 = document.createElement("h3");
  h2.textContent = "Repeated phrases";
  const h3 = document.createElement("h3");
  h3.textContent = "Filler words";
  body.append(title, about, h1, list(found.words, "No word comes up three times or more."), h2, list(found.phrases, "No phrase of three words repeats."), h3, list(found.filler, "None of the usual ones. Nice."));
}

plotra.registerPanel({
  id: "repeats",
  title: "Repeated words",
  async render(body) {
    await draw(body);
    plotra.on("note.open", () => draw(body));
    plotra.on("notes.change", (change) => {
      if (shown && change.changed.includes(shown)) draw(body);
    });
  },
});
`;
