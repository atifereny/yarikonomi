export type Direction = "alacak" | "verecek";
/** "karsiliksiz": çek tahsil edilemedi / ödenemedi; tutarlara ve açık bakiyeye girmez */
export type Status = "odendi" | "odenmedi" | "karsiliksiz";

export interface EntryLike {
  direction: Direction;
  amount: number;
  date: string;
  status: Status;
  /** Kişi "ödeme zamanı belirsiz" işaretli */
  undated?: boolean;
  /** Ödenen kısım (kuruş) */
  paid_amount?: number;
}

/** Ödeme zamanı belirsiz bir kişiye ait, henüz ödenmemiş kayıt: takvim toplamlarına girmez. */
export const isUncertain = (e: EntryLike) =>
  !!e.undated && e.status === "odenmedi";

export interface Summary {
  /** Alacaklar toplamı (kuruş) */
  receivable: number;
  /** Verecekler toplamı (kuruş) */
  payable: number;
  /** receivable - payable */
  net: number;
  count: number;
}

export type Tone = "positive" | "negative" | "neutral";

export const EMPTY_SUMMARY: Summary = {
  receivable: 0,
  payable: 0,
  net: 0,
  count: 0,
};

export function summarize(entries: readonly EntryLike[]): Summary {
  let receivable = 0;
  let payable = 0;
  let count = 0;
  for (const e of entries) {
    if (isUncertain(e)) continue;
    count++;
    if (e.status === "karsiliksiz") continue;
    if (e.direction === "alacak") receivable += e.amount;
    else payable += e.amount;
  }
  return { receivable, payable, net: receivable - payable, count };
}

/** Yalnızca ödenmemiş kayıtların kalan (ödenmemiş) kısmı üzerinden açık bakiye. */
export function openBalance(entries: readonly EntryLike[]): Summary {
  return summarize(
    entries
      .filter((e) => e.status === "odenmedi")
      .map((e) => ({ ...e, amount: e.amount - (e.paid_amount ?? 0) })),
  );
}

/** Ödeme zamanı belirsiz kayıtların kalan tutarları (takvim toplamlarına girmeyenler). */
export function uncertainBalance(entries: readonly EntryLike[]): Summary {
  const list = entries.filter(isUncertain).map((e) => ({
    ...e,
    undated: false,
    amount: e.amount - (e.paid_amount ?? 0),
  }));
  return summarize(list);
}

/** Kayıt yoksa ya da net sıfırsa nötr. */
export function toneOf(s: Summary): Tone {
  if (s.count === 0 || s.net === 0) return "neutral";
  return s.net > 0 ? "positive" : "negative";
}

/** Bir yılın 12 ayı için (0-11) kayıtları gruplar. Başka yıla ait kayıtlar yok sayılır. */
export function groupByMonth<T extends EntryLike>(
  entries: readonly T[],
  year: number,
): T[][] {
  const months: T[][] = Array.from({ length: 12 }, () => []);
  const prefix = `${year}-`;
  for (const e of entries) {
    if (!e.date.startsWith(prefix)) continue;
    const m = Number(e.date.slice(5, 7)) - 1;
    if (m >= 0 && m < 12) months[m].push(e);
  }
  return months;
}

export function monthSummaries(
  entries: readonly EntryLike[],
  year: number,
): Summary[] {
  return groupByMonth(entries, year).map(summarize);
}

export function groupByDay<T extends EntryLike>(
  entries: readonly T[],
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const e of entries) {
    const list = map.get(e.date);
    if (list) list.push(e);
    else map.set(e.date, [e]);
  }
  return map;
}

/** Nokta göstergeleri: önce alacaklar (yeşil), sonra verecekler (kırmızı); `max`tan fazlası "+N". */
export function dotsFor(
  entries: readonly EntryLike[],
  max: number,
): { dots: Direction[]; extra: number } {
  const alacak = entries.filter((e) => e.direction === "alacak").length;
  const dirs: Direction[] = [
    ...Array<Direction>(alacak).fill("alacak"),
    ...Array<Direction>(entries.length - alacak).fill("verecek"),
  ];
  if (dirs.length <= max) return { dots: dirs, extra: 0 };
  return { dots: dirs.slice(0, max), extra: dirs.length - max };
}

export const START_YEAR = 2026;

/** Gösterilecek yıl aralığı: 2026'dan (ya da daha eski kayıt varsa onun yılından) bugünün bir yıl sonrasına. */
export function visibleYears(
  dataYears: readonly number[],
  currentYear: number,
): number[] {
  const min = Math.min(START_YEAR, currentYear, ...dataYears);
  const max = Math.max(currentYear + 1, ...dataYears);
  const out: number[] = [];
  for (let y = min; y <= max; y++) out.push(y);
  return out;
}
