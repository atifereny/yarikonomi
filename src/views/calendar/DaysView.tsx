import { AnimatePresence, motion } from "framer-motion";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { cardAt } from "./nearestCard";
import {
  ChevronLeft,
  ChevronRight,
  DownloadIcon,
} from "../../components/icons";
import { IconButton, Money, cx } from "../../components/ui";
import type { Entry } from "../../lib/api";
import { useSlideDirection } from "../../lib/hooks";
import { MONTHS, WEEKDAYS_SHORT, isoWeek, monthGrid } from "../../lib/dates";
import { formatAmount, formatTL } from "../../lib/money";
import { softSpring, spring } from "../../lib/motion";
import { monthPeriod, weekPeriod } from "../../lib/report";
import {
  groupByDay,
  isUncertain,
  openBalance,
  summarize,
  uncertainBalance,
} from "../../lib/summary";
import { useApp } from "../../state";

const slide = {
  enter: (d: number) => ({ x: d * 80, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (d: number) => ({ x: d * -80, opacity: 0 }),
};

export function DaysView({
  year,
  month,
  entries,
  today,
  selectedDay,
  onSelectDay,
  onShift,
}: {
  year: number;
  month: number;
  entries: Entry[];
  today: string;
  selectedDay: string | null;
  onSelectDay: (iso: string) => void;
  onShift: (delta: number) => void;
}) {
  const { exportReport } = useApp();
  const key = year * 12 + month;
  const dir = useSlideDirection(key);

  const prefix = `${year}-${String(month + 1).padStart(2, "0")}-`;
  const monthEntries = useMemo(
    () => entries.filter((e) => e.date.startsWith(prefix)),
    [entries, prefix],
  );
  const byDay = useMemo(() => groupByDay(monthEntries), [monthEntries]);
  const s = summarize(monthEntries);
  const open = openBalance(monthEntries);
  const unc = uncertainBalance(monthEntries);
  const weeks = monthGrid(year, month);

  const rootRef = useRef<HTMLDivElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  /** Gün hücreleri yayvanlaşmasın: genişlik, kullanılabilir yüksekliğe göre sınırlanır (hücre ≈ 1,15 : 1) */
  const [maxW, setMaxW] = useState<number | null>(null);
  useEffect(() => {
    const box = outerRef.current;
    if (!box) return;
    const ro = new ResizeObserver(() => {
      const gridH = box.clientHeight - 290; // başlık + özet kartları + gün adları + alt boşluk
      const cellH = gridH / weeks.length;
      setMaxW(Math.max(720, cellH * 1.15 * 7 + 28 + 7 * 6 + 48));
    });
    ro.observe(box);
    return () => ro.disconnect();
  }, [weeks.length]);
  const selectRef = useRef(onSelectDay);
  selectRef.current = onSelectDay;

  // Ctrl + tekerlek yukarı (ya da iki parmakla büyütme): imlecin yanındaki günün kayıtlarını aç
  useEffect(() => {
    const box = rootRef.current;
    if (!box) return;
    let last = 0;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      if (e.deltaY >= 0 || Date.now() - last < 500) return;
      const card = cardAt(box, e, "[data-day]");
      if (!card?.dataset.day) return;
      last = Date.now();
      selectRef.current(card.dataset.day);
    };
    box.addEventListener("wheel", onWheel, { passive: false });
    return () => box.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <div ref={outerRef} className="h-full w-full">
      <div
        ref={rootRef}
        className="h-full mx-auto flex flex-col px-6 pb-24"
        style={{ maxWidth: maxW ?? undefined }}
      >
        <div className="flex items-center gap-1 shrink-0">
          <h1 className="text-[34px] font-bold tracking-tight">
            {MONTHS[month]}{" "}
            <span className="text-label2 font-semibold">{year}</span>
          </h1>
          <IconButton
            label="Önceki ay"
            onClick={() => onShift(-1)}
            className="ml-2"
          >
            <ChevronLeft size={18} />
          </IconButton>
          <IconButton label="Sonraki ay" onClick={() => onShift(1)}>
            <ChevronRight size={18} />
          </IconButton>
          <IconButton
            label={`${MONTHS[month]} ${year} raporunu indir`}
            onClick={() =>
              exportReport({ kind: "period", period: monthPeriod(year, month) })
            }
          >
            <DownloadIcon size={18} />
          </IconButton>
        </div>

        {/* Ay özeti */}
        <div className="grid grid-cols-3 gap-3 mt-3 mb-4 shrink-0">
          <SummaryCard
            label="Toplam alınacak"
            value={formatTL(s.receivable)}
            sub={`Bekleyen ${formatTL(open.receivable)}`}
            className="text-green"
          />
          <SummaryCard
            label="Toplam verilecek"
            value={formatTL(s.payable)}
            sub={`Bekleyen ${formatTL(open.payable)}`}
            className="text-red"
          />
          <SummaryCard
            label="Net"
            value={<Money value={s.net} signed />}
            sub={`${s.count} kayıt${unc.count > 0 ? ` · Vadesiz ${formatTL(unc.net)}` : ""}`}
          />
        </div>

        {/* Hafta günleri */}
        <div className="grid grid-cols-[28px_repeat(7,minmax(0,1fr))] gap-1.5 mb-1.5 shrink-0">
          <div
            className="text-center text-[10px] font-semibold uppercase text-label3 self-center"
            title="Hafta numarası"
          >
            Hf
          </div>
          {WEEKDAYS_SHORT.map((d, i) => (
            <div
              key={d}
              className={cx(
                "text-center text-[12px] font-semibold uppercase",
                i >= 5 ? "text-label3" : "text-label2",
              )}
            >
              {d}
            </div>
          ))}
        </div>

        <div className="relative flex-1 min-h-0">
          <AnimatePresence initial={false} custom={dir} mode="popLayout">
            <motion.div
              key={key}
              custom={dir}
              variants={slide}
              initial="enter"
              animate="center"
              exit="exit"
              transition={softSpring}
              className="absolute inset-0 grid grid-cols-[28px_repeat(7,minmax(0,1fr))] gap-1.5"
              style={{
                gridTemplateRows: `repeat(${weeks.length}, minmax(0, 1fr))`,
              }}
            >
              {weeks.flat().map((cell, i) => {
                const el = (() => {
                  if (!cell) return <div key={`x${i}`} />;
                  const list = byDay.get(cell.iso) ?? [];
                  const ds = summarize(list);
                  // Önce alacaklar (yeşil), sonra verecekler (kırmızı); çekli olanların üstünde sarı nokta
                  const ordered = [...list].sort((x, y) =>
                    x.direction === y.direction
                      ? 0
                      : x.direction === "alacak"
                        ? -1
                        : 1,
                  );
                  const dots = ordered.slice(0, 6).map((x) => ({
                    faded: isUncertain(x),
                    direction: x.direction,
                    cheque: x.is_cheque,
                  }));
                  const extra = Math.max(0, ordered.length - 6);
                  const chequeFirms = [
                    ...new Set(
                      list
                        .filter((x) => x.is_cheque)
                        .map((x) => x.contact_name),
                    ),
                  ];
                  const isToday = cell.iso === today;
                  const isSelected = cell.iso === selectedDay;
                  return (
                    <motion.button
                      key={cell.iso}
                      data-day={cell.iso}
                      whileTap={{ scale: 0.94 }}
                      transition={spring}
                      onClick={() => onSelectDay(cell.iso)}
                      className={cx(
                        "relative flex flex-col items-center rounded-[14px] pt-1.5 pb-1.5 px-1 min-h-0 overflow-hidden transition-colors",
                        list.length
                          ? "bg-card shadow-card hover:bg-fill/70"
                          : "hover:bg-fill",
                        isSelected && "ring-2 ring-blue",
                      )}
                    >
                      <span
                        className={cx(
                          "w-8 h-8 flex items-center justify-center rounded-full text-[16px] tabular",
                          isToday
                            ? "bg-blue text-white font-semibold"
                            : cell.weekday >= 5
                              ? "text-label2"
                              : "text-label",
                        )}
                      >
                        {cell.day}
                      </span>
                      {list.length > 0 && (
                        <>
                          <div
                            className="mt-1.5 flex items-center gap-[4px] flex-wrap justify-center"
                            title={
                              chequeFirms.length
                                ? `Çek: ${chequeFirms.join(", ")}`
                                : undefined
                            }
                          >
                            {dots.map((d, i) => (
                              <span
                                key={i}
                                className={cx(
                                  "relative w-2 h-2 rounded-full shrink-0",
                                  d.faded && "opacity-35",
                                  d.direction === "alacak"
                                    ? "bg-green"
                                    : "bg-red dot-neg",
                                )}
                              >
                                {d.cheque && (
                                  <i className="absolute -top-[3px] -right-[3px] w-[5px] h-[5px] rounded-full bg-yellow ring-1 ring-card" />
                                )}
                              </span>
                            ))}
                            {extra > 0 && (
                              <span className="text-[10px] leading-none font-semibold text-label2">
                                +{extra}
                              </span>
                            )}
                          </div>
                          {ds.count > 0 && (
                            <span
                              className={cx(
                                "mt-auto text-[11px] font-semibold tabular truncate max-w-full",
                                ds.net > 0
                                  ? "text-green"
                                  : ds.net < 0
                                    ? "text-red"
                                    : "text-label2",
                              )}
                            >
                              {ds.net > 0 ? "+" : ""}
                              {formatAmount(ds.net)}
                            </span>
                          )}
                        </>
                      )}
                    </motion.button>
                  );
                })();
                if (i % 7 !== 0) return el;
                const first = weeks[i / 7].find(Boolean);
                return (
                  <Fragment key={`w${i}`}>
                    <div className="flex items-start justify-center pt-1.5">
                      {/* Gün numarasıyla aynı yükseklik ve aynı hizada (h-8 daire ile aynı); tıklayınca haftanın raporu */}
                      <button
                        type="button"
                        title={`${isoWeek(first!.iso)}. hafta · raporu indir`}
                        onClick={() =>
                          exportReport({
                            kind: "period",
                            period: weekPeriod(first!.iso),
                          })
                        }
                        className="h-8 w-full rounded-lg flex items-center justify-center text-[11px] font-semibold text-label3 tabular hover:bg-fill hover:text-blue transition-colors"
                      >
                        {isoWeek(first!.iso)}
                      </button>
                    </div>
                    {el}
                  </Fragment>
                );
              })}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub: string;
  className?: string;
}) {
  return (
    <div className="rounded-[14px] bg-card shadow-card px-4 py-3">
      <div className="text-[12px] text-label2">{label}</div>
      <div
        className={cx(
          "text-[19px] font-bold tabular tracking-tight",
          className,
        )}
      >
        {value}
      </div>
      <div className="text-[11px] text-label2 tabular">{sub}</div>
    </div>
  );
}
