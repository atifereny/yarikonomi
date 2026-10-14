import { describe, expect, it } from "vitest";
import { formatSignedTL, formatTL, kurusToInput, parseTL } from "./money";
import {
  addMonths,
  formatDateTR,
  isoWeek,
  monthGrid,
  monthRange,
  mondayOffset,
} from "./dates";
import {
  type EntryLike,
  dotsFor,
  groupByDay,
  monthSummaries,
  openBalance,
  summarize,
  toneOf,
  uncertainBalance,
  visibleYears,
} from "./summary";

const e = (
  direction: "alacak" | "verecek",
  amount: number,
  date: string,
  status: "odendi" | "odenmedi" = "odenmedi",
): EntryLike => ({
  direction,
  amount,
  date,
  status,
});

describe("para formatı", () => {
  it("Türkçe biçimde gösterir", () => {
    expect(formatTL(123456)).toBe("1.234,56 ₺");
    expect(formatTL(5)).toBe("0,05 ₺");
    expect(formatTL(100000000)).toBe("1.000.000,00 ₺");
    expect(formatTL(-2550)).toBe("-25,50 ₺");
    expect(formatSignedTL(100)).toBe("+1,00 ₺");
    expect(formatSignedTL(0)).toBe("0,00 ₺");
  });

  it("kullanıcı girişini kuruşa çevirir", () => {
    expect(parseTL("1.234,56")).toBe(123456);
    expect(parseTL("1234,5")).toBe(123450);
    expect(parseTL("1234")).toBe(123400);
    expect(parseTL("1.234")).toBe(123400);
    expect(parseTL("12.5")).toBe(1250);
    expect(parseTL(" 99,99 ₺ ")).toBe(9999);
    expect(parseTL("0,1")).toBe(10);
    expect(parseTL("")).toBeNull();
    expect(parseTL("abc")).toBeNull();
    expect(parseTL("1,2,3")).toBeNull();
    expect(parseTL("1,234")).toBeNull();
    expect(parseTL("12.34.5")).toBeNull();
  });

  it("form değerine geri çevirir", () => {
    expect(kurusToInput(123456)).toBe("1234,56");
    expect(kurusToInput(500)).toBe("5");
    expect(parseTL(kurusToInput(1005))).toBe(1005);
  });
});

describe("takvim", () => {
  it("Pazartesi başlangıçlı ızgara üretir", () => {
    // 1 Ekim 2026 Perşembe
    expect(mondayOffset(2026, 9)).toBe(3);
    const grid = monthGrid(2026, 9);
    expect(grid[0].slice(0, 3)).toEqual([null, null, null]);
    expect(grid[0][3]?.iso).toBe("2026-10-01");
    expect(grid.flat().filter(Boolean)).toHaveLength(31);
    expect(grid.every((w) => w.length === 7)).toBe(true);
  });

  it("Pazar ile başlayan ayda ilk hücre son sütundadır", () => {
    // 1 Şubat 2026 Pazar
    const grid = monthGrid(2026, 1);
    expect(grid[0][6]?.day).toBe(1);
    expect(grid[0][6]?.weekday).toBe(6);
  });

  it("artık yıl ve ay aralıkları", () => {
    expect(monthRange(2024, 1)).toEqual(["2024-02-01", "2024-02-29"]);
    expect(monthRange(2026, 1)).toEqual(["2026-02-01", "2026-02-28"]);
    expect(addMonths(2026, 11, 1)).toEqual({ year: 2027, month: 0 });
    expect(addMonths(2026, 0, -1)).toEqual({ year: 2025, month: 11 });
    expect(formatDateTR("2026-10-11", true)).toBe("11 Ekim 2026, Pazar");
  });
});

describe("toplamlar", () => {
  const entries = [
    e("alacak", 10000, "2026-01-05"),
    e("alacak", 2500, "2026-01-20", "odendi"),
    e("verecek", 4000, "2026-01-20"),
    e("verecek", 9000, "2026-02-03"),
    e("alacak", 100, "2025-01-01"),
  ];

  it("net = alacak - verecek", () => {
    const s = summarize(entries.slice(0, 3));
    expect(s).toEqual({
      receivable: 12500,
      payable: 4000,
      net: 8500,
      count: 3,
    });
  });

  it("ay özetleri yalnızca ilgili yılı kapsar", () => {
    const months = monthSummaries(entries, 2026);
    expect(months).toHaveLength(12);
    expect(months[0].net).toBe(8500);
    expect(months[1].net).toBe(-9000);
    expect(months[2].count).toBe(0);
    expect(toneOf(months[0])).toBe("positive");
    expect(toneOf(months[1])).toBe("negative");
    expect(toneOf(months[2])).toBe("neutral");
  });

  it("net sıfır olan ay nötrdür", () => {
    expect(
      toneOf(
        summarize([
          e("alacak", 100, "2026-03-01"),
          e("verecek", 100, "2026-03-02"),
        ]),
      ),
    ).toBe("neutral");
  });

  it("açık bakiye ödenenleri hariç tutar", () => {
    expect(openBalance(entries.slice(0, 3)).receivable).toBe(10000);
  });

  it("günlere göre gruplar", () => {
    const days = groupByDay(entries);
    expect(days.get("2026-01-20")).toHaveLength(2);
  });

  it("noktalar: önce yeşil, sonra kırmızı, fazlası +N", () => {
    const list = [
      e("verecek", 1, "2026-01-01"),
      e("alacak", 1, "2026-01-02"),
      e("alacak", 1, "2026-01-03"),
    ];
    expect(dotsFor(list, 5)).toEqual({
      dots: ["alacak", "alacak", "verecek"],
      extra: 0,
    });
    expect(dotsFor(list, 2)).toEqual({ dots: ["alacak", "alacak"], extra: 1 });
  });

  it("görünür yıllar veriyi ve bugünü kapsar", () => {
    expect(visibleYears([], 2026)).toEqual([2026, 2027]);
    expect(visibleYears([2022, 2026], 2026)).toEqual([
      2022, 2023, 2024, 2025, 2026, 2027,
    ]);
  });

  it("ISO hafta numarası", () => {
    expect(isoWeek("2026-01-01")).toBe(1); // Perşembe
    expect(isoWeek("2025-12-29")).toBe(1); // 2026'nın 1. haftası Aralık'ta başlar
    expect(isoWeek("2026-10-11")).toBe(41); // Pazar
    expect(isoWeek("2026-10-12")).toBe(42); // Pazartesi
    expect(isoWeek("2027-01-03")).toBe(53); // 2026 53 haftalı
    expect(isoWeek("2024-12-30")).toBe(1);
  });
});

describe("vadesiz ve kısmi ödeme", () => {
  const base = { date: "2026-03-01", status: "odenmedi" as const };
  it("vadesiz (ödenmemiş) kayıtlar toplam ve sayıya girmez; ödenince girer", () => {
    const list = [
      { ...base, direction: "alacak" as const, amount: 500, undated: true },
      { ...base, direction: "alacak" as const, amount: 100 },
    ];
    expect(summarize(list)).toMatchObject({ receivable: 100, count: 1 });
    expect(
      summarize([{ ...list[0], status: "odendi" as const }]).receivable,
    ).toBe(500);
    expect(uncertainBalance(list)).toMatchObject({ receivable: 500, count: 1 });
  });
  it("açık bakiye kısmi ödemeyi düşer", () => {
    const b = openBalance([
      { ...base, direction: "alacak" as const, amount: 1000, paid_amount: 300 },
    ]);
    expect(b.receivable).toBe(700);
  });
});
