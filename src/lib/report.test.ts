/// <reference types="node" />
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { Contact, Entry } from "./api";
import { weekRange } from "./dates";
import { buildExcel } from "./export/excel";
import {
  buildPeriodReport,
  buildStatement,
  dayPeriod,
  monthPeriod,
  rangePeriod,
  weekPeriod,
  yearPeriod,
} from "./report";

const FONT_DIR = "C:/Windows/Fonts/";
vi.mock("@tauri-apps/api/core", () => ({
  invoke: async (_cmd: string, args: { bold: boolean }) => {
    const b = readFileSync(
      FONT_DIR + (args.bold ? "segoeuib.ttf" : "segoeui.ttf"),
    );
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  },
}));

let id = 0;
const entry = (o: Partial<Entry>): Entry => ({
  id: ++id,
  contact_id: 1,
  contact_name: "Şişli Ğ Ltd.",
  direction: "alacak",
  amount: 100_00,
  date: "2026-10-12",
  description: "Fatura",
  status: "odenmedi",
  paid_date: null,
  is_cheque: false,
  cheque_no: "",
  bank: "",
  is_loan: false,
  paid_amount: 0,
  undated: false,
  created_at: "",
  ...o,
});

const contact: Contact = {
  id: 1,
  kind: "tuzel",
  tax_no: "1234567890",
  undated: false,
  threshold: 0,
  name: "",
  company: "Şişli Ğ Ltd.",
  address: "İstanbul",
  phone: "",
  email: "",
  note: "",
  created_at: "",
};

describe("rapor dönemleri", () => {
  it("hafta Pazartesi-Pazar olur ve yıl sınırını doğru adlandırır", () => {
    expect(weekRange("2026-10-14")).toEqual(["2026-10-12", "2026-10-18"]);
    expect(weekRange("2026-10-18")).toEqual(["2026-10-12", "2026-10-18"]);
    const w = weekPeriod("2027-01-01"); // Cuma: 2026'nın 53. haftası
    expect(w.from).toBe("2026-12-28");
    expect(w.title).toBe("2026 · 53. hafta");
  });

  it("ay, yıl ve gün aralıkları", () => {
    expect(monthPeriod(2026, 1)).toMatchObject({
      from: "2026-02-01",
      to: "2026-02-28",
    });
    expect(yearPeriod(2026)).toMatchObject({
      from: "2026-01-01",
      to: "2026-12-31",
    });
    expect(dayPeriod("2026-10-12")).toMatchObject({
      from: "2026-10-12",
      to: "2026-10-12",
    });
  });
});

describe("dönem raporu", () => {
  it("dönem dışını almaz, alınamayan çeki toplamlara katmaz", () => {
    const list = [
      entry({ amount: 500_00 }),
      entry({
        direction: "verecek",
        amount: 200_00,
        status: "odendi",
        paid_date: "2026-10-13",
      }),
      entry({ amount: 900_00, is_cheque: true, status: "karsiliksiz" }),
      entry({ date: "2026-11-01", amount: 7_00 }),
    ];
    const r = buildPeriodReport(monthPeriod(2026, 9), list);
    expect(r.main.rows).toHaveLength(3);
    const get = (l: string) => r.summary.find((s) => s.label === l)!.value;
    expect(get("Toplam alacak")).toBe(500_00);
    expect(get("Toplam verecek")).toBe(200_00);
    expect(get("Net")).toBe(300_00);
    expect(get("Bekleyen alacak")).toBe(500_00);
    expect(r.notes).toHaveLength(1);
    expect(r.extra).toHaveLength(0);
  });

  it("vadesiz kayıtlar toplamlara girmez, ayrı satırda gösterilir", () => {
    const r = buildPeriodReport(monthPeriod(2026, 9), [
      entry({ amount: 500_00 }),
      entry({ amount: 9000_00, undated: true, paid_amount: 1000_00 }),
    ]);
    const get = (l: string) => r.summary.find((x) => x.label === l)!.value;
    expect(get("Toplam alacak")).toBe(500_00);
    expect(get("Vadesiz bekleyen (net)")).toBe(8000_00);
    expect(r.notes).toHaveLength(1);
  });

  it("serbest aralık: sınırlar dahil, birden çok ay varsa aylık özet", () => {
    const list = [
      entry({ date: "2026-10-31", amount: 100_00 }),
      entry({ date: "2026-11-01", amount: 200_00 }),
      entry({ date: "2026-12-15", amount: 400_00 }),
      entry({ date: "2027-01-01", amount: 800_00 }),
    ];
    const r = buildPeriodReport(rangePeriod("2026-10-31", "2026-12-15"), list);
    expect(r.main.rows).toHaveLength(3);
    expect(r.summary[0].value).toBe(700_00);
    expect(r.extra[0].rows.map((x) => x.cells[0])).toEqual([
      "Ekim 2026",
      "Kasım 2026",
      "Aralık 2026",
    ]);
    expect(
      buildPeriodReport(rangePeriod("2026-10-01", "2026-10-31"), list).extra,
    ).toHaveLength(0);
  });

  it("yıl raporunda aylık özet tablosu olur", () => {
    const r = buildPeriodReport(yearPeriod(2026), [
      entry({}),
      entry({ date: "2026-03-01", amount: 50_00 }),
    ]);
    expect(r.extra[0].rows).toHaveLength(12);
    expect(r.extra[0].rows[9].cells[2]).toBe(100_00);
  });
});

describe("cari ekstre", () => {
  const list = [
    entry({
      date: "2026-01-10",
      amount: 1000_00,
      status: "odendi",
      paid_amount: 1000_00,
      paid_date: "2026-01-20",
    }),
    entry({ date: "2026-02-10", amount: 300_00 }),
    entry({ date: "2026-03-10", direction: "verecek", amount: 800_00 }),
  ];

  it("kalan bakiye yalnızca ödenmemiş kayıtlarla ilerler", () => {
    const r = buildStatement(contact, list);
    expect(r.main.rows.map((x) => x.cells[6])).toEqual([0, 300_00, -500_00]);
    const open = r.summary.find((s) => s.label === "Açık bakiye")!;
    expect(open.value).toBe(500_00);
    expect(open.hint).toBe("Sizin borcunuz");
    expect(r.summary.find((s) => s.label === "Tahsil edilen")!.value).toBe(
      1000_00,
    );
  });

  it("kısmi ödeme kalan bakiyeden düşer, tahsil edilen toplamı sayar", () => {
    const r = buildStatement({ ...contact, undated: true }, [
      entry({
        date: "2026-01-10",
        amount: 1000_00,
        paid_amount: 400_00,
        undated: true,
      }),
    ]);
    expect(r.main.rows[0].cells[6]).toBe(600_00);
    expect(r.summary.find((x) => x.label === "Tahsil edilen")!.value).toBe(
      400_00,
    );
    expect(r.summary.find((x) => x.label === "Toplam alacak")!.value).toBe(
      1000_00,
    ); // vadesiz ayrımı ekstrede uygulanmaz
  });

  it("tarih aralığı uygulanır", () => {
    const r = buildStatement(contact, list, {
      from: "2026-02-01",
      to: "2026-02-28",
    });
    expect(r.main.rows).toHaveLength(1);
  });
});

describe("dosya üretimi", () => {
  it("Excel dosyası (zip) üretir", async () => {
    const bytes = await buildExcel(buildStatement(contact, [entry({})]));
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe("PK");
  }, 30_000);

  it.runIf(existsSync(FONT_DIR + "segoeui.ttf"))(
    "Türkçe karakterli PDF üretir",
    async () => {
      const { buildPdf } = await import("./export/pdf");
      const bytes = await buildPdf(
        buildPeriodReport(yearPeriod(2026), [
          entry({}),
          entry({ is_cheque: true, bank: "Ziraat Bankası" }),
        ]),
      );
      expect(String.fromCharCode(...bytes.subarray(0, 5))).toBe("%PDF-");
      expect(bytes.length).toBeGreaterThan(5000);
    },
    30_000,
  );
});
