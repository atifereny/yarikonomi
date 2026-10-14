import { invoke } from "@tauri-apps/api/core";
import type { Direction, Status } from "./summary";

export type Theme = "system" | "light" | "dark";

export type DbStatus =
  | { state: "ready" }
  | { state: "missing" }
  | { state: "error"; message: string };

export interface AppInfo {
  status: DbStatus;
  data_dir: string;
  db_path: string;
  backup_dir: string;
  default_backup_dir: string;
  custom_backup_dir: boolean;
  theme: Theme;
  last_backup_at: string | null;
  last_backup_error: string | null;
  schema_version: number;
}

export type ContactKind = "gercek" | "tuzel";

export interface ContactInput {
  /** gercek: T.C. kimlik no, tuzel: vergi kimlik no */
  kind: ContactKind;
  tax_no: string;
  /** Ödeme zamanı belirsiz: ödenmemiş kayıtları takvim toplamlarına girmez */
  undated: boolean;
  /** Tahsilat eşiği (kuruş); açık alacak buna ulaşınca uyarı verilir. 0 = yok */
  threshold: number;
  name: string;
  company: string;
  address: string;
  phone: string;
  email: string;
  note: string;
}

export interface Contact extends ContactInput {
  id: number;
  created_at: string;
}

export interface ContactWithBalance extends Contact {
  open_receivable: number;
  open_payable: number;
  entry_count: number;
}

export interface EntryInput {
  contact_id: number;
  direction: Direction;
  amount: number;
  date: string;
  description: string;
  status: Status;
  paid_date: string | null;
  /** Çek / ileri tarihli kayıt; bu durumda `date` vade tarihidir */
  is_cheque: boolean;
  cheque_no: string;
  bank: string;
  /** Kredi ödemesi: yön "verecek", `bank` banka adı */
  is_loan: boolean;
  /** Ödenen / tahsil edilen kısım (kuruş); "ödendi" durumunda tutara eşittir */
  paid_amount: number;
}

export interface Entry extends EntryInput {
  id: number;
  created_at: string;
  contact_name: string;
  /** Kişi "ödeme zamanı belirsiz" işaretliyse true */
  undated: boolean;
}

export interface YearSummary {
  year: number;
  receivable: number;
  payable: number;
  count: number;
}

export interface BackupFile {
  name: string;
  path: string;
  size: number;
  created: string;
}

export function contactName(c: Pick<Contact, "name" | "company">): string {
  return c.name || c.company || "İsimsiz";
}

/** Tauri dışında (ör. tarayıcıda vite) açıldığında anlaşılır hata. */
function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!("__TAURI_INTERNALS__" in window)) {
    return Promise.reject(
      "Bu uygulama yalnızca masaüstü (Tauri) penceresinde çalışır.",
    );
  }
  return invoke<T>(cmd, args);
}

export const api = {
  appInfo: () => call<AppInfo>("app_info"),
  setTheme: (theme: Theme) => call<void>("set_theme", { theme }),
  setBackupDir: (dir: string | null) => call<void>("set_backup_dir", { dir }),
  listBackups: () => call<BackupFile[]>("list_backups"),
  backupNow: () => call<string>("backup_now"),
  restoreBackup: (path: string) => call<void>("restore_backup", { path }),
  createFreshDb: () => call<void>("create_fresh_db"),
  retryOpen: () => call<void>("retry_open"),
  openFolder: (path: string) => call<void>("open_folder", { path }),
  exportJson: (path: string) => call<void>("export_json", { path }),
  importJson: (path: string) =>
    call<{ contacts: number; entries: number }>("import_json", { path }),

  listContacts: () => call<ContactWithBalance[]>("list_contacts"),
  getContact: (id: number) => call<ContactWithBalance>("get_contact", { id }),
  createContact: (input: ContactInput) =>
    call<Contact>("create_contact", { input }),
  updateContact: (id: number, input: ContactInput) =>
    call<void>("update_contact", { id, input }),
  deleteContact: (id: number) => call<void>("delete_contact", { id }),

  listEntries: (from: string, to: string) =>
    call<Entry[]>("list_entries", { from, to }),
  listContactEntries: (contactId: number) =>
    call<Entry[]>("list_contact_entries", { contactId }),
  yearSummaries: () => call<YearSummary[]>("year_summaries"),
  createEntry: (input: EntryInput) => call<number>("create_entry", { input }),
  updateEntry: (id: number, input: EntryInput) =>
    call<void>("update_entry", { id, input }),
  setEntryPaid: (id: number, paid: boolean, paidDate: string | null = null) =>
    call<void>("set_entry_paid", { id, paid, paidDate }),
  setEntryStatus: (
    id: number,
    status: Status,
    paidDate: string | null = null,
  ) => call<void>("set_entry_status", { id, status, paidDate }),
  addPayment: (id: number, amount: number, paidDate: string | null = null) =>
    call<void>("add_payment", { id, amount, paidDate }),
  collectPayment: (
    contactId: number,
    direction: Direction,
    amount: number,
    paidDate: string | null = null,
  ) =>
    call<{ touched: number; closed: number }>("collect_payment", {
      contactId,
      direction,
      amount,
      paidDate,
    }),
  deleteEntry: (id: number) => call<void>("delete_entry", { id }),
};

/** Ödeme zamanı belirsiz bir müşterinin açık alacağı belirlenen eşiğe ulaştı mı? */
export function thresholdReached(
  c: Pick<ContactWithBalance, "undated" | "threshold" | "open_receivable">,
): boolean {
  return c.undated && c.threshold > 0 && c.open_receivable >= c.threshold;
}

export function errorText(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  return String(e);
}
