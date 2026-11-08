// One of Plotra's own plugins (./index.ts). Plain JavaScript in a string: no backticks or "${" in it.
export const code = String.raw`// ==Plotra plugin==
// @name        Daily word goal
// @description A word goal for each day, how far you are today, and the last two weeks
// @version     1.0
// @access      read
// ==/Plotra plugin==

// Today's words are the project's words now, less what it had when you first
// opened it today. What it keeps, in the plugin's own storage: your goal, and
// per project, each day's starting count and words written.

const DEFAULT_GOAL = 500;
const DAYS_KEPT = 30;
const project = plotra.project.id;

const today = () => {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
};
const projectWords = async () => (await plotra.notes.list()).reduce((sum, n) => sum + n.wordCount, 0);
const goal = async () => {
  const value = Number(await plotra.storage.get("goal"));
  return value > 0 ? value : DEFAULT_GOAL;
};

/** Today's words, recorded in the project's history. */
async function record(quiet) {
  const day = today();
  const key = "days:" + project;
  const days = (await plotra.storage.get(key)) || {};
  const words = await projectWords();
  const entry = days[day] || { start: words, written: 0, met: false };
  const written = Math.max(0, words - entry.start);
  const target = await goal();
  const met = entry.met || written >= target;
  if (met && !entry.met && !quiet) plotra.ui.toast("Daily goal reached: " + written.toLocaleString() + " words today.", "success");
  if (!days[day] || written !== entry.written || met !== entry.met) {
    days[day] = { start: entry.start, written, met };
    const keep = Object.keys(days).sort().slice(-DAYS_KEPT);
    const next = {};
    for (const k of keep) next[k] = days[k];
    await plotra.storage.set(key, next);
  }
  return { days, written, target };
}

const STYLE = "h3{margin:0 0 8px;font-size:13px}.big{font-size:22px;font-weight:600;font-variant-numeric:tabular-nums}" +
  ".muted{color:var(--plotra-muted-foreground)}.bar{height:8px;border-radius:4px;background:var(--plotra-muted);margin:8px 0 14px;overflow:hidden}" +
  ".bar span{display:block;height:100%;background:var(--plotra-primary)}form{display:flex;gap:6px;align-items:center;margin:0 0 16px}" +
  "input{width:90px;padding:3px 6px;border:1px solid var(--plotra-border);border-radius:6px;background:transparent}" +
  "button{padding:3px 10px;border:1px solid var(--plotra-border);border-radius:6px;background:var(--plotra-secondary);cursor:pointer}" +
  ".days{display:flex;align-items:flex-end;gap:3px;height:60px}.days span{flex:1;background:var(--plotra-primary);border-radius:2px 2px 0 0;min-height:2px;opacity:.85}" +
  ".days span.missed{background:var(--plotra-muted-foreground);opacity:.4}";

async function draw(body) {
  const { days, written, target } = await record(true);
  body.replaceChildren();
  const style = document.createElement("style");
  style.textContent = STYLE;
  const title = document.createElement("h3");
  title.textContent = "Today";
  const big = document.createElement("div");
  big.className = "big";
  big.textContent = written.toLocaleString() + " / " + target.toLocaleString();
  const note = document.createElement("div");
  note.className = "muted";
  note.textContent = written >= target ? "Goal reached. Anything more is a bonus." : (target - written).toLocaleString() + " words to go.";
  const bar = document.createElement("div");
  bar.className = "bar";
  const fill = document.createElement("span");
  fill.style.width = Math.min(100, Math.round((written / target) * 100)) + "%";
  bar.append(fill);

  const form = document.createElement("form");
  const label = document.createElement("label");
  label.textContent = "Daily goal ";
  const input = document.createElement("input");
  input.type = "number";
  input.min = "1";
  input.max = "100000";
  input.value = String(target);
  label.append(input);
  const save = document.createElement("button");
  save.textContent = "Save";
  form.append(label, save);
  form.onsubmit = async (event) => {
    event.preventDefault();
    const value = Math.floor(Number(input.value));
    if (!(value > 0 && value <= 100000)) return plotra.ui.toast("A goal is a number of words, from 1 to 100,000.", "error");
    await plotra.storage.set("goal", value);
    plotra.ui.toast("Your daily goal is " + value.toLocaleString() + " words.", "success");
    draw(body);
  };

  const history = document.createElement("h3");
  history.textContent = "Last 14 days";
  const chart = document.createElement("div");
  chart.className = "days";
  const most = Math.max(target, ...Object.values(days).map((d) => d.written));
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    const entry = days[key];
    const col = document.createElement("span");
    const words = entry ? entry.written : 0;
    col.style.height = Math.round((words / most) * 100) + "%";
    if (!entry || !entry.met) col.className = "missed";
    col.title = key + ": " + words.toLocaleString() + " words";
    chart.append(col);
  }
  const legend = document.createElement("p");
  legend.className = "muted";
  const streak = (() => {
    let n = 0;
    for (let i = written >= target ? 0 : 1; ; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      if (!days[key] || !days[key].met) return n;
      n++;
    }
  })();
  legend.textContent = streak ? "A streak of " + streak + (streak === 1 ? " day" : " days") + " at your goal." : "Days at your goal are filled in.";
  body.append(style, title, big, note, bar, form, history, chart, legend);
}

if (plotra.panel) {
  plotra.registerPanel({
    id: "goal",
    title: "Daily word goal",
    async render(body) {
      await draw(body);
      plotra.on("notes.change", () => draw(body));
    },
  });
} else {
  plotra.registerPanel({ id: "goal", title: "Daily word goal", render() {} });
  // Keeps count with the panel closed, so the history and the toast don't depend on it.
  await record();
  plotra.on("notes.change", () => record());
}
`;
