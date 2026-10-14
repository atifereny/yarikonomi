import { invoke } from "@tauri-apps/api/core";
import {
  dateText,
  moneyText,
  type Report,
  type Table,
  type Tone,
} from "../report";

const COLORS = {
  alacak: [30, 142, 62] as [number, number, number],
  verecek: [217, 48, 37] as [number, number, number],
  muted: [142, 142, 147] as [number, number, number],
  head: [10, 132, 255] as [number, number, number],
};

function toneColor(tone: Tone | undefined, value: number) {
  if (tone === "alacak") return COLORS.alacak;
  if (tone === "verecek") return COLORS.verecek;
  if (tone === "signed")
    return value > 0 ? COLORS.alacak : value < 0 ? COLORS.verecek : undefined;
  return undefined;
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Türkçe karakterleri (ş, ğ, İ, ₺ …) gösterebilmek için Windows'un Segoe UI yazı tipi gömülür. */
async function loadFont(doc: import("jspdf").jsPDF) {
  const [regular, bold] = await Promise.all([
    invoke<ArrayBuffer>("read_system_font", { bold: false }),
    invoke<ArrayBuffer>("read_system_font", { bold: true }),
  ]);
  doc.addFileToVFS("rapor-normal.ttf", toBase64(regular));
  doc.addFont("rapor-normal.ttf", "Rapor", "normal");
  doc.addFileToVFS("rapor-bold.ttf", toBase64(bold));
  doc.addFont("rapor-bold.ttf", "Rapor", "bold");
  doc.setFont("Rapor", "normal");
}

function bodyOf(table: Table) {
  return table.rows.map((r) =>
    r.cells.map((v, i) => {
      const col = table.columns[i];
      if (v === null || v === "") return "";
      if (col.kind === "date") return dateText(String(v));
      if (col.kind === "money") return moneyText(Number(v), col.tone);
      return String(v);
    }),
  );
}

/** Sütun ağırlıklarını sayfa genişliğine (pt) paylaştırır */
function columnStyles(table: Table, available: number) {
  const total = table.columns.reduce((a, c) => a + c.width, 0);
  const styles: Record<
    number,
    { halign: "right" | "left"; cellWidth: number }
  > = {};
  table.columns.forEach((c, i) => {
    styles[i] = {
      halign: c.kind === "money" ? "right" : "left",
      cellWidth: Math.max(
        (c.width / total) * available,
        c.kind === "date" ? 62 : 0,
      ),
    };
  });
  return styles;
}

/** Raporu PDF dosyasına çevirir */
export async function buildPdf(report: Report): Promise<Uint8Array> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({
    orientation: report.portrait ? "portrait" : "landscape",
    unit: "pt",
    format: "a4",
  });
  await loadFont(doc);
  const margin = 36;
  const pageW = doc.internal.pageSize.getWidth();

  let y = margin + 8;
  doc.setFont("Rapor", "bold");
  doc.setFontSize(18);
  doc.text(report.title, margin, y);
  y += 18;
  doc.setFont("Rapor", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.muted);
  for (const line of report.info) {
    doc.text(line, margin, y);
    y += 14;
  }
  doc.setTextColor(0, 0, 0);
  y += 6;

  const base = {
    styles: {
      font: "Rapor",
      fontSize: 9,
      cellPadding: 4,
      overflow: "linebreak" as const,
    },
    headStyles: {
      fillColor: COLORS.head,
      textColor: 255,
      fontStyle: "bold" as const,
    },
    alternateRowStyles: {
      fillColor: [245, 245, 247] as [number, number, number],
    },
    margin: { left: margin, right: margin, bottom: 40 },
  };

  // Özet
  autoTable(doc, {
    ...base,
    startY: y,
    theme: "plain",
    tableWidth: 300,
    styles: { ...base.styles, fontSize: 10, cellPadding: 3 },
    alternateRowStyles: {},
    body: report.summary.map((s) => [
      s.label,
      moneyText(s.value) + " ₺",
      s.hint ?? "",
    ]),
    columnStyles: {
      0: { fontStyle: "bold" },
      1: { halign: "right" },
      2: { textColor: COLORS.muted },
    },
    didParseCell: (d) => {
      if (d.section === "body" && d.column.index === 1) {
        const s = report.summary[d.row.index];
        const c = toneColor(s.tone, s.value);
        if (c) d.cell.styles.textColor = c;
        d.cell.styles.fontStyle = "bold";
      }
    },
  });
  y =
    (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
      .finalY + 18;

  const draw = (table: Table, title: string | null) => {
    if (title) {
      doc.setFont("Rapor", "bold");
      doc.setFontSize(12);
      doc.text(title, margin, y);
      y += 6;
    }
    autoTable(doc, {
      ...base,
      startY: y,
      head: [table.columns.map((c) => c.header)],
      body: bodyOf(table),
      columnStyles: columnStyles(table, pageW - margin * 2),
      didParseCell: (d) => {
        const col = table.columns[d.column.index];
        if (d.section === "head") {
          d.cell.styles.halign = col.kind === "money" ? "right" : "left";
          return;
        }
        const row = table.rows[d.row.index];
        if (row.failed) {
          d.cell.styles.textColor = COLORS.muted;
          d.cell.styles.fontStyle = "normal";
          return;
        }
        if (col.kind === "money" && row.cells[d.column.index] !== null) {
          const c = toneColor(col.tone, Number(row.cells[d.column.index]));
          if (c) d.cell.styles.textColor = c;
        }
      },
    });
    y =
      (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
        .finalY + 18;
  };

  for (const t of report.extra) draw(t, t.name);
  if (report.main.rows.length === 0) {
    doc.setFontSize(11);
    doc.setTextColor(...COLORS.muted);
    doc.text("Bu dönemde kayıt yok.", margin, y + 4);
    doc.setTextColor(0, 0, 0);
    y += 24;
  } else {
    draw(report.main, report.extra.length ? report.main.name : null);
  }

  // Notlar
  doc.setFont("Rapor", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...COLORS.muted);
  for (const n of report.notes) {
    const lines = doc.splitTextToSize(n, pageW - margin * 2) as string[];
    if (y + lines.length * 11 > doc.internal.pageSize.getHeight() - 40) {
      doc.addPage();
      y = margin;
    }
    doc.text(lines, margin, y);
    y += lines.length * 11 + 4;
  }

  // Alt bilgi: sayfa numarası ve oluşturulma zamanı
  const pages = doc.getNumberOfPages();
  const now = new Date();
  const local = `${dateText(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`)} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.muted);
    const h = doc.internal.pageSize.getHeight();
    doc.text(`Yarıkonomi · ${local}`, margin, h - 20);
    doc.text(`Sayfa ${p} / ${pages}`, pageW - margin, h - 20, {
      align: "right",
    });
  }

  return new Uint8Array(doc.output("arraybuffer"));
}
