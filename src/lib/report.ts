import type { Contact, Entry } from "./api";
import { contactName } from "./api";
import {
  MONTHS,
  formatDateShort,
  formatDateTR,
  isoWeek,
  isoWeekYear,
  monthRange,
  parseISO,
  toISO,
  weekRange,
} from "./dates";
import { formatAmount, formatTL } from "./money";
import { statusText } from "./status";
import {
  isUncertain,
  openBalance,
  summarize,
  uncertainBalance,
} from "./summary";

/** Raporun kapsadığı dönem: yıl, ay, hafta ya da gün */
export interface Period {
  kind: "year" | "month" | "week" | "day" | "range";
  from: string;
  to: string;
  title: string;
  /** Dosya adı (uzantısız) */
  file: string;
}

export function yearPeriod(year: number): Period {
  return {
    kind: "year",
    from: toISO(year, 0, 1),
    to: toISO(year, 11, 31),
    title: `${year} yılı`,
    file: `Yarikonomi_${year}`,
  };
}

export function monthPeriod(year: number, month: number): Period {
  const [from, to] = monthRange(year, month);
  return {
    kind: "month",
    from,
    to,
    title: `${MONTHS[month]} ${year}`,
    file: `Yarikonomi_${year}-${String(month + 1).padStart(2, "0")}_${MONTHS[month]}`,
  };
}

export function weekPeriod(anyDay: string): Period {
  const [from, to] = weekRange(anyDay);
  const w = isoWeek(anyDay);
  const y = isoWeekYear(anyDay);
  return {
    kind: "week",
    from,
    to,
    title: `${y} · ${w}. hafta`,
    file: `Yarikonomi_${y}_Hafta-${String(w).padStart(2, "0")}`,
  };
}

/** Serbest tarih aralığı (başlangıç ve bitiş dahil) */
export function rangePeriod(from: string, to: string): Period {
  return {
    kind: "range",
    from,
    to,
    title: `${formatDateShort(from)} – ${formatDateShort(to)}`,
    file: `Yarikonomi_${from}_${to}`,
  };
}

export function dayPeriod(iso: string): Period {
  return {
    kind: "day",
    from: iso,
    to: iso,
    title: formatDateTR(iso, true),
    file: `Yarikonomi_${iso}`,
  };
}

// --- Rapor modeli (Excel ve PDF aynı modelden üretilir) ---------------------------

export type ColumnKind = "text" | "date" | "money";
export type Tone = "alacak" | "verecek" | "signed";

export interface Column {
  header: string;
  kind: ColumnKind;
  /** Excel'de karakter genişliği; PDF'de oransal ağırlık */
  width: number;
  /** Para sütunu rengi: alacak (yeşil) / verecek (kırmızı) / işaretli bakiye */
  tone?: Tone;
}

/** text: metin · date: "YYYY-AA-GG" · money: kuruş (null = boş hücre) */
export type Cell = string | number | null;

export interface Row {
  cells: Cell[];
  /** Alınamayan / ödenemeyen çek: soluk gösterilir */
  failed?: boolean;
}

export interface Table {
  /** Excel sayfa adı ve PDF'de tablo başlığı */
  name: string;
  columns: Column[];
  rows: Row[];
}

export interface SummaryLine {
  label: string;
  value: number;
  tone?: Tone;
  /** Değerin yanında gösterilecek kısa açıklama */
  hint?: string;
}

export interface Report {
  title: string;
  /** Başlığın altındaki bilgi satırları */
  info: string[];
  summary: SummaryLine[];
  /** Ana tablodan önce gelen ek tablolar (ör. yıl raporunda aylık özet) */
  extra: Table[];
  main: Table;
  notes: string[];
  fileName: string;
  portrait: boolean;
}

const byDateThenId = (a: Entry, b: Entry) =>
  a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id;

function typeText(e: Entry): string {
  if (e.is_loan) return e.bank ? `Kredi · ${e.bank}` : "Kredi";
  if (e.is_cheque)
    return ["Çek", e.bank, e.cheque_no ? `No ${e.cheque_no}` : ""]
      .filter(Boolean)
      .join(" · ");
  return "";
}

function stateText(e: Entry): string {
  const t = statusText(e.direction, e.is_cheque);
  if (e.status === "odendi") return t.done;
  if (e.status === "karsiliksiz") {
    return e.paid_date
      ? `${t.failed}, sonradan ${e.direction === "alacak" ? "alındı" : "ödendi"}`
      : t.failed;
  }
  const part =
    e.paid_amount > 0
      ? `Kısmen (kalan ${formatTL(e.amount - e.paid_amount)})`
      : t.pending;
  return isUncertain(e) ? `${part} · vadesiz` : part;
}

const safeFile = (s: string) =>
  s.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "_");

function filterRange(
  entries: readonly Entry[],
  from: string | null,
  to: string | null,
): Entry[] {
  return entries
    .filter((e) => (!from || e.date >= from) && (!to || e.date <= to))
    .sort(byDateThenId);
}

const UNCERTAIN_NOTE =
  "“Vadesiz” kayıtlar, ödeme zamanı belirsiz olarak işaretli kişilere aittir; ödenene kadar toplam alacak / verecek / net tutarlara girmez.";
const FAILED_NOTE =
  "Alınamayan / ödenemeyen çekler listede görünür ancak toplamlara ve bakiyeye dahil edilmez.";

/** Dönem raporu: yıl, ay, hafta veya gün için tüm kayıtlar */
export function buildPeriodReport(
  period: Period,
  all: readonly Entry[],
): Report {
  const entries = filterRange(all, period.from, period.to);
  const s = summarize(entries);
  const open = openBalance(entries);
  const unc = uncertainBalance(entries);

  const main: Table = {
    name: "Kayıtlar",
    columns: [
      { header: "Tarih", kind: "date", width: 12 },
      { header: "Kişi / Firma", kind: "text", width: 26 },
      { header: "Açıklama", kind: "text", width: 30 },
      { header: "Tür", kind: "text", width: 22 },
      { header: "Alacak", kind: "money", width: 15, tone: "alacak" },
      { header: "Verecek", kind: "money", width: 15, tone: "verecek" },
      { header: "Durum", kind: "text", width: 16 },
      { header: "Ödeme tarihi", kind: "date", width: 13 },
    ],
    rows: entries.map((e) => ({
      failed: e.status === "karsiliksiz",
      cells: [
        e.date,
        e.contact_name,
        e.description,
        typeText(e),
        e.direction === "alacak" ? e.amount : null,
        e.direction === "verecek" ? e.amount : null,
        stateText(e),
        e.status === "odenmedi" ? null : e.paid_date,
      ],
    })),
  };

  const extra: Table[] = [];
  // Yıl ve birden çok aya yayılan aralıklar için aylık özet
  if (
    period.kind === "year" ||
    (period.kind === "range" &&
      period.from.slice(0, 7) !== period.to.slice(0, 7))
  ) {
    const a = parseISO(period.from);
    const b = parseISO(period.to);
    const rows: Row[] = [];
    for (let i = a.year * 12 + a.month; i <= b.year * 12 + b.month; i++) {
      const y = Math.floor(i / 12);
      const m = i % 12;
      const prefix = `${y}-${String(m + 1).padStart(2, "0")}-`;
      const ms = summarize(entries.filter((e) => e.date.startsWith(prefix)));
      const name = period.kind === "year" ? MONTHS[m] : `${MONTHS[m]} ${y}`;
      if (ms.count === 0) rows.push({ cells: [name, "", null, null, null] });
      else
        rows.push({
          cells: [name, String(ms.count), ms.receivable, ms.payable, ms.net],
        });
    }
    extra.push({
      name: "Aylık özet",
      columns: [
        { header: "Ay", kind: "text", width: 14 },
        { header: "Kayıt", kind: "text", width: 8 },
        { header: "Alacak", kind: "money", width: 16, tone: "alacak" },
        { header: "Verecek", kind: "money", width: 16, tone: "verecek" },
        { header: "Net", kind: "money", width: 16, tone: "signed" },
      ],
      rows,
    });
  }

  return {
    title: `${period.title} raporu`,
    info: [
      period.from === period.to
        ? formatDateShort(period.from)
        : `${formatDateShort(period.from)} – ${formatDateShort(period.to)}`,
      `${entries.length} kayıt`,
    ],
    summary: [
      { label: "Toplam alacak", value: s.receivable, tone: "alacak" },
      { label: "Toplam verecek", value: s.payable, tone: "verecek" },
      { label: "Net", value: s.net, tone: "signed" },
      { label: "Bekleyen alacak", value: open.receivable, tone: "alacak" },
      { label: "Bekleyen verecek", value: open.payable, tone: "verecek" },
      ...(unc.count > 0
        ? [
            {
              label: "Vadesiz bekleyen (net)",
              value: unc.net,
              tone: "signed" as const,
              hint: "toplamlara dahil değil",
            },
          ]
        : []),
    ],
    extra,
    main,
    notes: [
      ...(entries.some((e) => e.status === "karsiliksiz") ? [FAILED_NOTE] : []),
      ...(unc.count > 0 ? [UNCERTAIN_NOTE] : []),
    ],
    fileName: safeFile(period.file),
    portrait: false,
  };
}

/** Cari ekstre: bir kişinin hareketleri ve kalan bakiyesi (isteğe bağlı tarih aralığı) */
export function buildStatement(
  contact: Contact,
  all: readonly Entry[],
  range: { from: string | null; to: string | null } = { from: null, to: null },
): Report {
  // Ekstre bir kişinin tüm hareketlerini gösterir; "vadesiz" ayrımı burada uygulanmaz
  const entries = filterRange(all, range.from, range.to).map((e) => ({
    ...e,
    undated: false,
  }));
  const s = summarize(entries);
  const open = openBalance(entries);
  const paidOf = (dir: "alacak" | "verecek") =>
    entries
      .filter((e) => e.direction === dir && e.status !== "karsiliksiz")
      .reduce((sum, e) => sum + e.paid_amount, 0);

  // Kalan bakiye yalnızca ödenmemiş kayıtlarla ilerler (+ size borçlu, − sizin borcunuz)
  let balance = 0;
  const main: Table = {
    name: "Ekstre",
    columns: [
      { header: "Tarih", kind: "date", width: 12 },
      { header: "Açıklama", kind: "text", width: 34 },
      { header: "Tür", kind: "text", width: 22 },
      { header: "Alacak", kind: "money", width: 15, tone: "alacak" },
      { header: "Verecek", kind: "money", width: 15, tone: "verecek" },
      { header: "Durum", kind: "text", width: 16 },
      { header: "Kalan bakiye", kind: "money", width: 16, tone: "signed" },
    ],
    rows: entries.map((e) => {
      if (e.status === "odenmedi") {
        const rem = e.amount - e.paid_amount;
        balance += e.direction === "alacak" ? rem : -rem;
      }
      return {
        failed: e.status === "karsiliksiz",
        cells: [
          e.date,
          e.description,
          typeText(e),
          e.direction === "alacak" ? e.amount : null,
          e.direction === "verecek" ? e.amount : null,
          stateText(e),
          balance,
        ],
      };
    }),
  };

  const identity = [
    contact.kind === "tuzel" ? "Tüzel kişi" : "Gerçek kişi",
    contact.tax_no
      ? `${contact.kind === "tuzel" ? "VKN" : "T.C. No"}: ${contact.tax_no}`
      : "",
  ];
  const period =
    range.from || range.to
      ? `Dönem: ${range.from ? formatDateShort(range.from) : "…"} – ${range.to ? formatDateShort(range.to) : "…"}`
      : "Dönem: tüm kayıtlar";
  const info = [
    identity,
    [contact.phone, contact.email],
    [contact.address.replace(/\s*\n\s*/g, ", ")],
    [period],
  ]
    .map((parts) => parts.filter(Boolean).join(" · "))
    .filter(Boolean);

  const net = open.net;
  return {
    title: `Cari ekstre · ${contactName(contact)}`,
    info,
    summary: [
      { label: "Toplam alacak", value: s.receivable, tone: "alacak" },
      { label: "Toplam verecek", value: s.payable, tone: "verecek" },
      { label: "Tahsil edilen", value: paidOf("alacak"), tone: "alacak" },
      { label: "Ödenen", value: paidOf("verecek"), tone: "verecek" },
      {
        label: "Açık bakiye",
        value: Math.abs(net),
        tone: net > 0 ? "alacak" : net < 0 ? "verecek" : undefined,
        hint:
          net > 0 ? "Size borçlu" : net < 0 ? "Sizin borcunuz" : "Bakiye yok",
      },
    ],
    extra: [],
    main,
    notes: [
      "Kalan bakiye yalnızca ödenmemiş kayıtların kalan tutarıyla hesaplanır (kısmi ödemeler düşülür); tamamen ödenen / alınan kayıtlar bakiyeyi etkilemez. Artı değer: size borçlu, eksi değer: sizin borcunuz.",
      ...(entries.some((e) => e.status === "karsiliksiz") ? [FAILED_NOTE] : []),
    ],
    fileName: safeFile(`Ekstre_${contactName(contact)}`),
    portrait: true,
  };
}

/** Para hücresinin metni (PDF): işaretli sütunlarda artı işareti gösterilir */
export function moneyText(kurus: number, tone?: Tone): string {
  return tone === "signed" && kurus > 0
    ? `+${formatAmount(kurus)}`
    : formatAmount(kurus);
}

/** "2026-10-12" -> "12.10.2026" */
export function dateText(iso: string): string {
  const { year, month, day } = parseISO(iso);
  return `${String(day).padStart(2, "0")}.${String(month + 1).padStart(2, "0")}.${year}`;
}
