/** Saves text as a file from the browser. CSV gets a byte-order mark so spreadsheets read it as UTF-8. */
export function downloadText(fileName: string, mime: string, text: string) {
  const blob = new Blob([mime === "text/csv" ? "﻿" : "", text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // Give the browser a moment to start the download before the URL goes.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
