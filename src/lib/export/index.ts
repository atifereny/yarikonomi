import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import type { Report } from "../report";

export type ExportFormat = "excel" | "pdf";

const KEY = "muhasebe.exportFormat";

export function readFormat(): ExportFormat {
  try {
    return localStorage.getItem(KEY) === "pdf" ? "pdf" : "excel";
  } catch {
    return "excel";
  }
}

export function writeFormat(f: ExportFormat) {
  try {
    localStorage.setItem(KEY, f);
  } catch {
    /* yoksay */
  }
}

/**
 * Raporu seçilen biçimde üretir; kaydetme penceresinden yer seçtirir ve dosyayı yazar.
 * Kullanıcı vazgeçerse null, aksi halde kaydedilen yolu döndürür.
 */
export async function saveReport(
  report: Report,
  format: ExportFormat,
): Promise<string | null> {
  const ext = format === "excel" ? "xlsx" : "pdf";
  const path = await save({
    defaultPath: `${report.fileName}.${ext}`,
    filters: [
      {
        name: format === "excel" ? "Excel çalışma kitabı" : "PDF belgesi",
        extensions: [ext],
      },
    ],
  });
  if (!path) return null;
  const bytes =
    format === "excel"
      ? await (await import("./excel")).buildExcel(report)
      : await (await import("./pdf")).buildPdf(report);
  await invoke("save_file", bytes, {
    headers: { path: encodeURIComponent(path) },
  });
  return path;
}
