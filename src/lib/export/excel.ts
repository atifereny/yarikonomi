import { parseISO } from "../dates";
import type { Cell, Column, Report, Table, Tone } from "../report";

const MONEY_FMT = '#,##0.00 "₺";-#,##0.00 "₺"';
const COLORS = {
  alacak: "FF1E8E3E",
  verecek: "FFD93025",
  muted: "FF8E8E93",
  head: "FF0A84FF",
};

function toneColor(tone: Tone | undefined, value: number): string | undefined {
  if (tone === "alacak") return COLORS.alacak;
  if (tone === "verecek") return COLORS.verecek;
  if (tone === "signed")
    return value > 0 ? COLORS.alacak : value < 0 ? COLORS.verecek : undefined;
  return undefined;
}

/** Yerel saat dilimi kaymasın diye öğlen UTC */
function excelDate(iso: string): Date {
  const { year, month, day } = parseISO(iso);
  return new Date(Date.UTC(year, month, day, 12));
}

type Sheet = import("exceljs").Worksheet;

function writeTable(
  ws: Sheet,
  startRow: number,
  table: Table,
  withFilter: boolean,
): number {
  const head = ws.getRow(startRow);
  table.columns.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLORS.head },
    };
    cell.alignment = {
      horizontal: c.kind === "money" ? "right" : "left",
      vertical: "middle",
    };
  });
  head.height = 22;

  table.rows.forEach((r, ri) => {
    const row = ws.getRow(startRow + 1 + ri);
    r.cells.forEach((v: Cell, i) => {
      const col: Column = table.columns[i];
      const cell = row.getCell(i + 1);
      if (v === null || v === "") return;
      if (col.kind === "date") {
        cell.value = excelDate(String(v));
        cell.numFmt = "dd.mm.yyyy";
        cell.alignment = { horizontal: "left" };
      } else if (col.kind === "money") {
        const n = Number(v) / 100;
        cell.value = n;
        cell.numFmt = MONEY_FMT;
        const color = toneColor(col.tone, n);
        if (color && !r.failed) cell.font = { color: { argb: color } };
      } else {
        cell.value = String(v);
      }
      if (r.failed)
        cell.font = {
          color: { argb: COLORS.muted },
          italic: true,
          strike: col.kind === "money",
        };
    });
    if (ri % 2 === 1) {
      table.columns.forEach((_, i) => {
        row.getCell(i + 1).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF5F5F7" },
        };
      });
    }
  });

  const last = startRow + table.rows.length;
  if (withFilter && table.rows.length > 0) {
    ws.autoFilter = {
      from: { row: startRow, column: 1 },
      to: { row: last, column: table.columns.length },
    };
  }
  return last;
}

function setWidths(ws: Sheet, columns: Column[]) {
  columns.forEach((c, i) => {
    ws.getColumn(i + 1).width = Math.max(c.width, 10);
  });
}

function titleBlock(ws: Sheet, report: Report, cols: number): number {
  let r = 1;
  ws.mergeCells(r, 1, r, Math.max(cols, 2));
  const t = ws.getCell(r, 1);
  t.value = report.title;
  t.font = { bold: true, size: 16 };
  ws.getRow(r).height = 26;
  r++;
  for (const line of report.info) {
    ws.mergeCells(r, 1, r, Math.max(cols, 2));
    const c = ws.getCell(r, 1);
    c.value = line;
    c.font = { color: { argb: COLORS.muted } };
    r++;
  }
  return r + 1;
}

/** Raporu .xlsx dosyasına çevirir */
export async function buildExcel(report: Report): Promise<Uint8Array> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Yarıkonomi";
  wb.created = new Date();

  const ws = wb.addWorksheet(report.main.name, {
    pageSetup: {
      orientation: report.portrait ? "portrait" : "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });
  const cols = report.main.columns.length;
  setWidths(ws, report.main.columns);

  let r = titleBlock(ws, report, cols);

  // Özet
  for (const s of report.summary) {
    ws.getCell(r, 1).value = s.label;
    ws.getCell(r, 1).font = { bold: true };
    ws.mergeCells(r, 1, r, 2);
    const v = ws.getCell(r, 3);
    v.value = s.value / 100;
    v.numFmt = MONEY_FMT;
    v.font = {
      bold: true,
      color: { argb: toneColor(s.tone, s.value) ?? "FF000000" },
    };
    if (s.hint) {
      ws.getCell(r, 4).value = s.hint;
      ws.getCell(r, 4).font = { color: { argb: COLORS.muted } };
    }
    r++;
  }
  r++;

  for (const t of report.extra) {
    const sheet = wb.addWorksheet(t.name);
    setWidths(sheet, t.columns);
    writeTable(sheet, 1, t, false);
    sheet.views = [{ state: "frozen", ySplit: 1 }];
  }

  const headerRow = r;
  const last = writeTable(ws, headerRow, report.main, true);
  ws.views = [{ state: "frozen", ySplit: headerRow }];

  r = last + 2;
  for (const n of report.notes) {
    ws.mergeCells(r, 1, r, Math.max(cols, 2));
    ws.getCell(r, 1).value = n;
    ws.getCell(r, 1).font = { italic: true, color: { argb: COLORS.muted } };
    ws.getCell(r, 1).alignment = { wrapText: true, vertical: "top" };
    ws.getRow(r).height = 30;
    r++;
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}
