import { motion } from "framer-motion";
import { useEffect, useMemo, useRef } from "react";
import { DownloadIcon } from "../../components/icons";
import { Money, cx } from "../../components/ui";
import { yearPeriod } from "../../lib/report";
import { useApp } from "../../state";
import type { Entry } from "../../lib/api";
import { MONTHS_SHORT } from "../../lib/dates";
import { spring } from "../../lib/motion";
import { cardAt } from "./nearestCard";
import {
  type Summary,
  monthSummaries,
  summarize,
  toneOf,
} from "../../lib/summary";

const toneBg = {
  positive: "bg-green",
  negative: "bg-red",
  neutral: "bg-fill2",
  even: "bg-yellow",
} as const;

export function YearsView({
  years,
  entries,
  currentYear,
  onOpen,
  onMoreYears,
}: {
  years: number[];
  entries: Entry[];
  currentYear: number;
  onOpen: (year: number, el: HTMLElement | null) => void;
  onMoreYears: () => void;
}) {
  const data = useMemo(() => {
    const map = new Map<number, { total: Summary; months: Summary[] }>();
    for (const y of years) {
      const yearEntries = entries.filter((e) => e.date.startsWith(`${y}-`));
      map.set(y, {
        total: summarize(yearEntries),
        months: monthSummaries(yearEntries, y),
      });
    }
    return map;
  }, [years, entries]);

  const { exportReport } = useApp();
  const rootRef = useRef<HTMLDivElement>(null);
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  // Ctrl + tekerlek yukarı (ya da iki parmakla büyütme): imlecin yanındaki yıla gir
  useEffect(() => {
    const box = rootRef.current;
    if (!box) return;
    let last = 0;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      if (e.deltaY >= 0 || Date.now() - last < 500) return;
      const card = cardAt(box, e, "[data-year]");
      if (!card) return;
      last = Date.now();
      onOpenRef.current(Number(card.dataset.year), card);
    };
    box.addEventListener("wheel", onWheel, { passive: false });
    return () => box.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <div ref={rootRef} className="h-full overflow-y-auto fade-top px-6 pb-28">
      <h1 className="text-[34px] font-bold tracking-tight mb-5">Yıllar</h1>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
        {years.map((y) => {
          const d = data.get(y)!;
          return (
            <motion.button
              key={y}
              data-year={y}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.97 }}
              transition={spring}
              onClick={(e) => onOpen(y, e.currentTarget)}
              className="group text-left rounded-[18px] bg-card shadow-card p-4 hover:shadow-pop/40 transition-shadow"
            >
              <div className="flex items-baseline justify-between">
                <span className="flex items-center gap-1.5">
                  <span
                    className={cx(
                      "text-[26px] font-bold tracking-tight",
                      y === currentYear ? "text-blue" : "text-label",
                    )}
                  >
                    {y}
                  </span>
                  <span
                    role="button"
                    tabIndex={-1}
                    title={`${y} raporunu indir`}
                    aria-label={`${y} raporunu indir`}
                    onClick={(e) => {
                      e.stopPropagation();
                      exportReport({ kind: "period", period: yearPeriod(y) });
                    }}
                    className="inline-flex items-center justify-center w-6 h-6 rounded-full text-blue opacity-0 group-hover:opacity-100 hover:bg-fill transition-opacity"
                  >
                    <DownloadIcon size={15} />
                  </span>
                </span>
                <span className="text-[12px] text-label2">
                  {d.total.count > 0 ? `${d.total.count} kayıt` : "Kayıt yok"}
                </span>
              </div>
              <div className="mt-1 text-[15px] font-semibold">
                <Money value={d.total.net} signed />
              </div>
              {/* Mini ay haritası */}
              <div className="mt-3 grid grid-cols-6 gap-1.5">
                {d.months.map((s, m) => (
                  <div key={m} className="flex flex-col items-center gap-1">
                    <span
                      className={cx(
                        "w-full h-2 rounded-full",
                        toneBg[s.count > 0 && s.net === 0 ? "even" : toneOf(s)],
                      )}
                    />
                    <span className="text-[9px] text-label2">
                      {MONTHS_SHORT[m]}
                    </span>
                  </div>
                ))}
              </div>
            </motion.button>
          );
        })}
      </div>
      <div className="flex justify-center mt-6">
        <button
          onClick={onMoreYears}
          className="h-9 px-4 rounded-full bg-fill text-blue text-[14px] font-semibold hover:bg-fill2 transition-colors"
        >
          Daha fazla yıl göster (+10)
        </button>
      </div>
    </div>
  );
}
