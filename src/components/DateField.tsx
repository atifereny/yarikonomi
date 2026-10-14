import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import {
  MONTHS,
  WEEKDAYS_SHORT,
  formatDateTR,
  monthGrid,
  parseISO,
  todayISO,
} from "../lib/dates";
import { spring } from "../lib/motion";
import { ChevronLeft, ChevronRight } from "./icons";
import { cx } from "./ui";

/**
 * iOS tarzı tarih seçici: satırda tarih "hap" olarak görünür, dokununca altında aylık takvim açılır.
 * Değer ve çıktı "YYYY-AA-GG" biçimindedir.
 */
export function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (iso: string) => void;
}) {
  const today = todayISO();
  const [open, setOpen] = useState(false);
  const base = parseISO(value || today);
  const [view, setView] = useState({ year: base.year, month: base.month });

  const toggle = () => {
    if (!open) {
      const b = parseISO(value || today);
      setView({ year: b.year, month: b.month });
    }
    setOpen((o) => !o);
  };

  const shift = (delta: number) =>
    setView((v) => {
      const m = v.month + delta;
      return { year: v.year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 };
    });

  const pick = (iso: string) => {
    onChange(iso);
    setOpen(false);
  };

  const weeks = monthGrid(view.year, view.month);

  return (
    <>
      <div className="flex items-center gap-3 px-4 min-h-11 py-1.5">
        <span className="w-28 shrink-0 text-label">{label}</span>
        <div className="flex-1 min-w-0 flex justify-end">
          <button
            type="button"
            onClick={toggle}
            className={cx(
              "h-8 px-3 rounded-[9px] bg-fill tabular transition-colors hover:bg-fill2",
              open && "text-blue",
            )}
          >
            {value ? formatDateTR(value) : "Tarih seçin"}
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={spring}
            className="overflow-hidden"
          >
            <div className="px-3 pt-1 pb-3 border-t border-sep">
              {/* Ay başlığı */}
              <div className="flex items-center justify-between h-11 px-1">
                <span className="text-[17px] font-semibold">
                  {MONTHS[view.month]}{" "}
                  <span className="text-label2 font-medium">{view.year}</span>
                </span>
                <div className="flex items-center gap-1 text-blue">
                  <button
                    type="button"
                    onClick={() => shift(-1)}
                    aria-label="Önceki ay"
                    className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-fill transition-colors"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <button
                    type="button"
                    onClick={() => shift(1)}
                    aria-label="Sonraki ay"
                    className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-fill transition-colors"
                  >
                    <ChevronRight size={20} />
                  </button>
                </div>
              </div>

              {/* Hafta günleri */}
              <div className="grid grid-cols-7 mb-1">
                {WEEKDAYS_SHORT.map((w, i) => (
                  <div
                    key={w}
                    className={cx(
                      "text-center text-[11px] font-semibold uppercase",
                      i >= 5 ? "text-label3" : "text-label2",
                    )}
                  >
                    {w}
                  </div>
                ))}
              </div>

              {/* Günler */}
              <div className="grid grid-cols-7 gap-y-1">
                {weeks.flat().map((c, i) => {
                  if (!c) return <span key={i} />;
                  const selected = c.iso === value;
                  const isToday = c.iso === today;
                  return (
                    <button
                      type="button"
                      key={c.iso}
                      onClick={() => pick(c.iso)}
                      className="flex items-center justify-center h-10"
                    >
                      <span
                        className={cx(
                          "w-9 h-9 rounded-full flex items-center justify-center text-[17px] tabular transition-colors",
                          selected
                            ? "bg-blue text-white font-semibold"
                            : isToday
                              ? "text-blue font-semibold hover:bg-fill"
                              : c.weekday >= 5
                                ? "text-label2 hover:bg-fill"
                                : "text-label hover:bg-fill",
                        )}
                      >
                        {c.day}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="flex justify-center pt-1">
                <button
                  type="button"
                  onClick={() => pick(today)}
                  className="h-8 px-4 rounded-full text-blue text-[15px] hover:bg-fill transition-colors"
                >
                  Bugün
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
