export const MONTHS = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
];
export const MONTHS_SHORT = [
  "Oca",
  "Şub",
  "Mar",
  "Nis",
  "May",
  "Haz",
  "Tem",
  "Ağu",
  "Eyl",
  "Eki",
  "Kas",
  "Ara",
];
/** Pazartesi başlangıçlı */
export const WEEKDAYS_SHORT = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
export const WEEKDAYS = [
  "Pazartesi",
  "Salı",
  "Çarşamba",
  "Perşembe",
  "Cuma",
  "Cumartesi",
  "Pazar",
];

const pad = (n: number) => String(n).padStart(2, "0");

/** month: 0-11 */
export function toISO(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

export function parseISO(iso: string): {
  year: number;
  month: number;
  day: number;
} {
  const [y, m, d] = iso.split("-").map(Number);
  return { year: y, month: m - 1, day: d };
}

export function todayISO(now: Date = new Date()): string {
  return toISO(now.getFullYear(), now.getMonth(), now.getDate());
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** Ayın ilk gününün Pazartesi'ye göre sütun indeksi (0 = Pazartesi … 6 = Pazar) */
export function mondayOffset(year: number, month: number): number {
  return (new Date(year, month, 1).getDay() + 6) % 7;
}

export interface DayCell {
  iso: string;
  day: number;
  /** Pazartesi=0 … Pazar=6 */
  weekday: number;
}

/** Ayın haftalarını döndürür; ay dışındaki hücreler null'dır. */
export function monthGrid(year: number, month: number): (DayCell | null)[][] {
  const offset = mondayOffset(year, month);
  const total = daysInMonth(year, month);
  const cells: (DayCell | null)[] = Array(offset).fill(null);
  for (let d = 1; d <= total; d++) {
    cells.push({
      iso: toISO(year, month, d),
      day: d,
      weekday: (offset + d - 1) % 7,
    });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (DayCell | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** ISO 8601 hafta numarası (Pazartesi başlangıçlı; yılın ilk haftası içinde 4 Ocak'ı barındıran hafta). */
export function isoWeek(iso: string): number {
  const { year, month, day } = parseISO(iso);
  const d = new Date(Date.UTC(year, month, day));
  const dayNum = (d.getUTCDay() + 6) % 7; // Pzt=0
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // haftanın Perşembesi
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const diff = (d.getTime() - firstThursday.getTime()) / 86400000;
  return 1 + Math.floor((diff + ((firstThursday.getUTCDay() + 6) % 7) - 3) / 7);
}

/** Verilen günün haftasının [Pazartesi, Pazar] tarihleri */
export function weekRange(iso: string): [string, string] {
  const { year, month, day } = parseISO(iso);
  const offset = (new Date(year, month, day).getDay() + 6) % 7;
  const at = (delta: number) => {
    const d = new Date(year, month, day + delta);
    return toISO(d.getFullYear(), d.getMonth(), d.getDate());
  };
  return [at(-offset), at(6 - offset)];
}

/** ISO hafta yılı (haftanın Perşembesinin yılı) */
export function isoWeekYear(iso: string): number {
  const { year, month, day } = parseISO(iso);
  const offset = (new Date(year, month, day).getDay() + 6) % 7;
  return new Date(year, month, day - offset + 3).getFullYear();
}

export function monthRange(year: number, month: number): [string, string] {
  return [toISO(year, month, 1), toISO(year, month, daysInMonth(year, month))];
}

export function addMonths(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const idx = year * 12 + month + delta;
  return { year: Math.floor(idx / 12), month: ((idx % 12) + 12) % 12 };
}

/** "2026-10-11" -> "11 Ekim 2026" ; withWeekday -> "11 Ekim 2026 Pazar" */
export function formatDateTR(iso: string, withWeekday = false): string {
  const { year, month, day } = parseISO(iso);
  const base = `${day} ${MONTHS[month]} ${year}`;
  if (!withWeekday) return base;
  const wd = (new Date(year, month, day).getDay() + 6) % 7;
  return `${base}, ${WEEKDAYS[wd]}`;
}

/** "2026-10-11" -> "11 Eki 2026" */
export function formatDateShort(iso: string): string {
  const { year, month, day } = parseISO(iso);
  return `${day} ${MONTHS_SHORT[month]} ${year}`;
}

/** "2026-10-11T13:05:22" veya "2026-10-11 13:05:22" -> "11 Eki 2026 13:05" */
export function formatDateTime(s: string): string {
  const [d, t = ""] = s.split(/[T ]/);
  return `${formatDateShort(d)} ${t.slice(0, 5)}`.trim();
}
