/** Tutarlar her yerde kuruş cinsinden tamsayıdır. */

function groupThousands(n: string): string {
  return n.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** 123456 -> "1.234,56" (işaretli) */
export function formatAmount(kurus: number): string {
  const neg = kurus < 0;
  const abs = Math.abs(Math.round(kurus));
  const lira = Math.floor(abs / 100);
  const kr = abs % 100;
  return `${neg ? "-" : ""}${groupThousands(String(lira))},${String(kr).padStart(2, "0")}`;
}

/** 123456 -> "1.234,56 ₺" */
export function formatTL(kurus: number): string {
  return `${formatAmount(kurus)} ₺`;
}

/** Net değerler için işaretli: "+1.234,56 ₺", "-50,00 ₺", "0,00 ₺" */
export function formatSignedTL(kurus: number): string {
  return `${kurus > 0 ? "+" : ""}${formatTL(kurus)}`;
}

/**
 * Kullanıcı girişini kuruşa çevirir. Geçersizse null.
 * Kabul edilenler: "1.234,56", "1234,5", "1234", "1.234", "1234.56" (tek nokta + 1-2 hane ondalık sayılır).
 */
export function parseTL(input: string): number | null {
  let s = input.trim().replace(/\s|₺|TL/gi, "");
  if (!s) return null;
  if (s.includes(",")) {
    if (s.indexOf(",") !== s.lastIndexOf(",")) return null;
    const [intPart, frac] = s.split(",");
    if (intPart.includes(".") && !/^\d{1,3}(\.\d{3})+$/.test(intPart))
      return null;
    s = `${intPart.replace(/\./g, "")}.${frac}`;
  } else if (s.includes(".")) {
    const parts = s.split(".");
    const last = parts[parts.length - 1];
    if (parts.length === 2 && last.length <= 2) {
      // "12.5" -> ondalık kabul edilir
    } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
      s = s.replace(/\./g, "");
    } else {
      return null;
    }
  }
  const m = /^(\d+)(?:\.(\d{0,2}))?$/.exec(s);
  if (!m) return null;
  const lira = Number(m[1]);
  const kr = Number((m[2] ?? "").padEnd(2, "0"));
  const total = lira * 100 + kr;
  return Number.isSafeInteger(total) ? total : null;
}

/** Düzenleme formunda başlangıç değeri: 123456 -> "1234,56" */
export function kurusToInput(kurus: number): string {
  const lira = Math.floor(kurus / 100);
  const kr = kurus % 100;
  return kr === 0 ? String(lira) : `${lira},${String(kr).padStart(2, "0")}`;
}
