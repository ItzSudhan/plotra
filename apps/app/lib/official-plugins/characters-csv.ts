// One of Plotra's own plugins (./index.ts). Plain JavaScript in a string: no backticks or "${" in it.
export const code = String.raw`// ==Plotra plugin==
// @name        Characters and places (CSV)
// @description Your characters and locations as a spreadsheet: name, aliases, tags, status and synopsis
// @version     1.0
// @access      read
// ==/Plotra plugin==

const KINDS = { character: "Character", location: "Location" };
const cell = (value) => {
  const text = String(value == null ? "" : value);
  return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
};

plotra.registerExport({
  id: "characters-csv",
  title: "Characters and places (CSV)",
  extension: "csv",
  async run() {
    const notes = (await plotra.notes.list()).filter((n) => KINDS[n.kind]);
    if (!notes.length) throw new Error("This project has no characters or locations yet.");
    const rows = [["Kind", "Name", "Aliases", "Tags", "Status", "Words", "Synopsis"]];
    for (const n of notes) rows.push([KINDS[n.kind], n.title, (n.aliases || []).join("; "), (n.tags || []).join("; "), n.status || "", n.wordCount, n.synopsis || ""]);
    // A byte-order mark, so spreadsheet apps read accents and other letters right.
    return { content: "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n", type: "text/csv" };
  },
});
`;
