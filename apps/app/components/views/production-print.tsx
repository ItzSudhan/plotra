"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { PrintCell, PrintSheet } from "@/lib/production-print";

// "Print or save as PDF" for the Production sheets, on the Read view's print
// path: the sheet is rendered into a `.plotra-print-portal` on <body> (globals.css
// prints only that), the browser's print dialog saves the PDF, and the portal goes
// once printing is over. The sheet itself is built in lib/production-print.ts.

/** Today's date as the sheet prints it: "18 October 2026". */
export const printDate = () => new Date().toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });

// Black on white, greys for structure, no colour carries meaning. The header row
// repeats on every page (a table's thead does), a row never splits, and a short
// group (a scene, a category, a sequence) moves to the next page whole.
const styles = (orientation: PrintSheet["orientation"]) => `
@media print {
  @page {
    size: ${orientation};
    margin: 12mm 12mm 14mm;
    @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 7.5pt ui-sans-serif, system-ui, sans-serif; color: #444; }
  }
}
.plotra-sheet { color: #000; background: #fff; font: 9pt/1.35 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
.plotra-sheet header { display: flex; align-items: flex-end; justify-content: space-between; gap: 16pt; border-bottom: 1.5pt solid #000; padding-bottom: 5pt; margin-bottom: 4pt; }
.plotra-sheet h1 { margin: 0; font-size: 16pt; font-weight: 700; line-height: 1.15; }
.plotra-sheet .project { font-size: 10pt; margin-top: 2pt; }
.plotra-sheet .date { font-size: 9pt; text-align: right; white-space: nowrap; }
.plotra-sheet .details { font-size: 8.5pt; color: #333; margin: 0 0 8pt; }
.plotra-sheet table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.plotra-sheet thead { display: table-header-group; }
.plotra-sheet .running th { font-size: 7pt; font-weight: 400; color: #555; text-transform: none; letter-spacing: 0; background: none; border: 0; padding: 0 0 3pt; }
.plotra-sheet .running span { float: right; }
.plotra-sheet .columns th { text-align: left; font-size: 7pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; background: #e4e4e4; border-top: 1pt solid #000; border-bottom: 1pt solid #000; padding: 3pt 4pt; }
.plotra-sheet td { vertical-align: top; padding: 3pt 4pt; border-bottom: 0.5pt solid #9a9a9a; overflow-wrap: anywhere; white-space: pre-wrap; }
.plotra-sheet tr { break-inside: avoid; page-break-inside: avoid; }
.plotra-sheet tbody.keep { break-inside: avoid; page-break-inside: avoid; }
.plotra-sheet .band td { font-size: 7.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; background: #f0f0f0; border-top: 0.75pt solid #555; border-bottom: 0.75pt solid #555; break-after: avoid; page-break-after: avoid; }
.plotra-sheet .right { text-align: right; font-variant-numeric: tabular-nums; }
.plotra-sheet .sub { display: block; font-size: 7.5pt; color: #444; }
.plotra-sheet .before { font-style: italic; }
.plotra-sheet img, .plotra-sheet .no-frame { display: block; width: 100%; aspect-ratio: 16 / 9; object-fit: cover; border: 0.5pt solid #9a9a9a; }
.plotra-sheet .no-frame { background: #eee; }
.plotra-sheet .empty { padding: 24pt 0; text-align: center; color: #444; }
`;

function Cell({ cell }: { cell: PrintCell }) {
  if (typeof cell === "string") return cell;
  if ("image" in cell) {
    // eslint-disable-next-line @next/next/no-img-element -- user-supplied storyboard frames from any host
    return cell.image ? <img src={cell.image} alt="" loading="eager" /> : <span className="no-frame" />;
  }
  return (
    <>
      {cell.before && <span className="sub before">{cell.before}</span>}
      {cell.text}
      {cell.after && <span className="sub">{cell.after}</span>}
    </>
  );
}

function Sheet({ sheet }: { sheet: PrintSheet }) {
  const span = sheet.columns.length;
  const where = [sheet.project, sheet.scope].filter(Boolean).join(" · ");
  return (
    <div className="plotra-sheet">
      <header>
        <div>
          <h1>{sheet.title}</h1>
          <div className="project">{where}</div>
        </div>
        <div className="date">{sheet.date}</div>
      </header>
      {sheet.details.length > 0 && <p className="details">{sheet.details.join(" · ")}</p>}
      <table>
        <colgroup>
          {sheet.columns.map((c, i) => (
            <col key={i} style={c.width ? { width: c.width } : undefined} />
          ))}
        </colgroup>
        <thead>
          <tr className="running">
            <th colSpan={span}>
              {where} — {sheet.title}
              <span>{sheet.date}</span>
            </th>
          </tr>
          <tr className="columns">
            {sheet.columns.map((c, i) => (
              <th key={i} className={c.align === "right" ? "right" : undefined}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        {sheet.groups.map((g, gi) => (
          <tbody key={gi} className={g.keep ? "keep" : undefined}>
            {g.heading !== null && (
              <tr className="band">
                <td colSpan={span}>{g.heading}</td>
              </tr>
            )}
            {g.rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci} className={sheet.columns[ci]?.align === "right" ? "right" : undefined}>
                    <Cell cell={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ))}
        {sheet.groups.every((g) => g.rows.length === 0) && (
          <tbody>
            <tr>
              <td colSpan={span} className="empty">
                Nothing to list.
              </td>
            </tr>
          </tbody>
        )}
      </table>
    </div>
  );
}

/** Waits (a little) for the sheet's pictures so they're on the page, then prints; `onDone` once the dialog closes. */
function PrintPortal({ sheet, onDone }: { sheet: PrintSheet; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const finish = () => onDone();
    window.addEventListener("afterprint", finish, { once: true });
    const pending = [...(ref.current?.querySelectorAll("img") ?? [])].filter((img) => !img.complete);
    const loaded = Promise.all(
      pending.map(
        (img) =>
          new Promise<void>((resolve) => {
            img.addEventListener("load", () => resolve(), { once: true });
            img.addEventListener("error", () => resolve(), { once: true });
          }),
      ),
    );
    const timer = setTimeout(() => {
      void Promise.race([loaded, new Promise<void>((resolve) => setTimeout(resolve, 3000))]).then(() => {
        if (!cancelled) window.print();
      });
    }, 50);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener("afterprint", finish);
    };
    // Prints once per sheet: the portal is mounted for one sheet and unmounted after.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div ref={ref} className="plotra-print-portal">
      <style>{styles(sheet.orientation)}</style>
      <Sheet sheet={sheet} />
    </div>,
    document.body,
  );
}

/** `print(sheet)` opens the print dialog on a sheet; render `portal` somewhere in the view. */
export function usePrintSheet() {
  const [sheet, setSheet] = useState<PrintSheet | null>(null);
  return {
    print: setSheet,
    portal: sheet ? <PrintPortal sheet={sheet} onDone={() => setSheet(null)} /> : null,
  };
}
