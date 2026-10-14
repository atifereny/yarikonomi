import { motion } from "framer-motion";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { DownloadIcon } from "../../components/icons";
import { IconButton, Money, cx } from "../../components/ui";
import type { Entry } from "../../lib/api";
import { MONTHS, WEEKDAYS_SHORT, monthGrid, parseISO } from "../../lib/dates";
import { spring } from "../../lib/motion";
import { monthPeriod, yearPeriod } from "../../lib/report";
import { groupByDay, groupByMonth, summarize } from "../../lib/summary";
import { useApp } from "../../state";
import { cardAt } from "./nearestCard";

const dayTone = {
  positive: "bg-green text-white",
  negative: "bg-red text-white day-neg",
  even: "bg-yellow text-black",
} as const;

function MonthGrid({
  year,
  month,
  list,
  today,
}: {
  year: number;
  month: number;
  list: Entry[];
  today: string;
}) {
  const weeks = useMemo(() => monthGrid(year, month), [year, month]);
  const byDay = useMemo(() => groupByDay(list), [list]);
  // Her ay 6 satır ayırır: aylar arası hizalama bozulmaz
  const cells = [...weeks.flat(), ...Array(42 - weeks.length * 7).fill(null)];
  return (
    <div
      className="flex-1 min-h-0 grid grid-cols-7 place-items-center tabular"
      style={{
        gridTemplateRows: "repeat(7, minmax(0, 1fr))",
        fontSize: "calc(var(--dc) * 0.5)",
        lineHeight: 1,
      }}
    >
      {WEEKDAYS_SHORT.map((w, i) => (
        <span
          key={w}
          className={i >= 5 ? "text-label3" : "text-label2"}
          style={{ fontSize: "0.82em" }}
        >
          {w}
        </span>
      ))}
      {cells.map((c, i) => {
        if (!c) return <span key={i} />;
        const dayEntries = byDay.get(c.iso);
        const daySum = dayEntries ? summarize(dayEntries) : null;
        const net = daySum?.net ?? 0;
        const hasCheque = !!dayEntries?.some((x) => x.is_cheque);
        const tone =
          !daySum || daySum.count === 0
            ? null
            : net > 0
              ? "positive"
              : net < 0
                ? "negative"
                : "even";
        return (
          <span
            key={i}
            className={cx(
              "relative rounded-full flex items-center justify-center font-medium",
              tone
                ? dayTone[tone]
                : c.weekday >= 5
                  ? "text-label2"
                  : "text-label",
              c.iso === today &&
                !tone &&
                "ring-2 ring-blue text-blue font-semibold",
              c.iso === today &&
                tone &&
                "ring-2 ring-blue ring-offset-1 ring-offset-bg",
            )}
            style={{ width: "var(--dc)", height: "var(--dc)" }}
          >
            {c.day}
            {hasCheque && (
              <i className="absolute -top-[2px] -right-[2px] w-[7px] h-[7px] rounded-full bg-orange ring-1 ring-bg" />
            )}
          </span>
        );
      })}
    </div>
  );
}

export function MonthsView({
  years,
  year,
  entries,
  today,
  onOpen,
  onYearChange,
  onMoreYears,
}: {
  years: number[];
  /** Ekranda görünen (ya da açılışta gösterilecek) yıl */
  year: number;
  /** Açılışta seçili ay (kullanılmıyor: yıl bölümü en üste gelir) */
  month?: number;
  entries: Entry[];
  today: string;
  onOpen: (year: number, month: number, el: HTMLElement | null) => void;
  onYearChange: (year: number) => void;
  onMoreYears: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { exportReport } = useApp();
  const t = parseISO(today);
  const data = useMemo(
    () =>
      years.map((y) => {
        const months = groupByMonth(entries, y);
        return { year: y, months, total: summarize(months.flat()) };
      }),
    [years, entries],
  );

  const sectionOf = (y: number) =>
    scrollRef.current?.querySelector<HTMLElement>(`[data-year="${y}"]`) ?? null;

  // Açılışta seçili yılın bölümü en üste gelir
  useLayoutEffect(() => {
    const box = scrollRef.current;
    const sec = sectionOf(year);
    if (box && sec)
      box.scrollTop =
        sec.getBoundingClientRect().top -
        box.getBoundingClientRect().top +
        box.scrollTop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Kaydırırken ekranın üstündeki yılı bildir
  useEffect(() => {
    const box = scrollRef.current;
    if (!box) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const line = box.getBoundingClientRect().top + box.clientHeight / 2;
        let cur = years[0];
        for (const y of years) {
          const el = sectionOf(y);
          if (el && el.getBoundingClientRect().top <= line) cur = y;
        }
        onYearChange(cur);
      });
    };
    box.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      box.removeEventListener("scroll", onScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [years, onYearChange]);

  // Ctrl + tekerlek yukarı (ya da dokunmatik yüzeyde iki parmakla büyütme): imlecin altındaki aya gir
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;
  useEffect(() => {
    const box = scrollRef.current;
    if (!box) return;
    let last = 0;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault(); // WebView'ın sayfa yakınlaştırmasını engelle
      if (e.deltaY >= 0 || Date.now() - last < 500) return;
      const card = cardAt(box, e, "[data-month]");
      if (!card) return;
      last = Date.now();
      const sec = card.closest<HTMLElement>("[data-year]");
      onOpenRef.current(
        Number(sec?.dataset.year),
        Number(card.dataset.month),
        card,
      );
    };
    box.addEventListener("wheel", onWheel, { passive: false });
    return () => box.removeEventListener("wheel", onWheel);
  }, []);

  // ← → bir önceki / sonraki yıla kaydır
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        document.querySelector("[role=dialog],[role=alertdialog]")
      )
        return;
      const i = years.indexOf(year) + (e.key === "ArrowLeft" ? -1 : 1);
      if (i >= 0 && i < years.length)
        sectionOf(years[i])?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [years, year]);

  return (
    <div
      ref={scrollRef}
      className="h-full overflow-y-auto fade-top snap-y snap-proximity"
      style={{ containerType: "size" }}
    >
      {data.map(({ year: y, months, total }) => (
        <section
          key={y}
          data-year={y}
          className="snap-start flex gap-[clamp(16px,3cqw,56px)] px-[clamp(16px,3cqw,56px)] pt-2 pb-24"
          style={{ height: "max(100cqh, 520px)" }}
        >
          {/* Dikey yıl rakamları */}
          <div
            className="shrink-0 flex flex-col items-center"
            style={{ width: "clamp(70px, 11cqw, 190px)" }}
          >
            <div
              className="flex-1 min-h-0 w-full flex flex-col justify-between"
              style={{ containerType: "size" }}
            >
              {String(y)
                .split("")
                .map((d, i) => (
                  <span
                    key={i}
                    className={cx(
                      "year-digit text-center",
                      y === t.year ? "text-blue" : "text-label",
                    )}
                    style={{
                      fontSize: "min(calc(100cqh / 4.2), calc(100cqw * 1.05))",
                    }}
                  >
                    {d}
                  </span>
                ))}
            </div>
            <div className="pt-2 flex flex-col items-center gap-0.5 text-[13px] font-semibold">
              {total.count > 0 && <Money value={total.net} signed />}
              <IconButton
                label={`${y} raporunu indir`}
                onClick={() =>
                  exportReport({ kind: "period", period: yearPeriod(y) })
                }
              >
                <DownloadIcon size={18} />
              </IconButton>
            </div>
          </div>

          {/* 4 × 3 ay ızgarası */}
          <div className="flex-1 min-w-0 grid grid-cols-4 grid-rows-3 gap-x-[clamp(12px,2cqw,36px)] gap-y-2">
            {months.map((list, m) => {
              const s = summarize(list);
              const isCurrent = y === t.year && m === t.month;
              return (
                <motion.button
                  key={m}
                  data-month={m}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  transition={spring}
                  onClick={(e) => onOpen(y, m, e.currentTarget)}
                  className="year-cell group min-h-0 flex flex-col text-left rounded-[14px] px-1 hover:bg-fill/50 transition-colors"
                >
                  <div
                    className="flex items-baseline gap-2 shrink-0"
                    style={{ height: "calc(100cqh / 8.8 * 1.6)" }}
                  >
                    <span
                      className={cx(
                        "font-bold tracking-tight",
                        isCurrent ? "text-blue" : "text-label",
                      )}
                      style={{
                        fontSize:
                          "min(calc(100cqh / 8.8 * 0.95), calc(100cqw * 0.11))",
                      }}
                    >
                      {MONTHS[m]}
                    </span>
                    {isCurrent && (
                      <span className="w-2 h-2 rounded-full bg-blue self-center" />
                    )}
                    <span
                      role="button"
                      tabIndex={-1}
                      title={`${MONTHS[m]} ${y} raporunu indir`}
                      aria-label={`${MONTHS[m]} ${y} raporunu indir`}
                      onClick={(e) => {
                        e.stopPropagation();
                        exportReport({
                          kind: "period",
                          period: monthPeriod(y, m),
                        });
                      }}
                      className="inline-flex items-center justify-center w-6 h-6 rounded-full text-blue opacity-0 group-hover:opacity-100 hover:bg-fill transition-opacity self-center"
                    >
                      <DownloadIcon size={15} />
                    </span>
                    {s.count > 0 && (
                      <span
                        className="ml-auto font-semibold"
                        style={{
                          fontSize:
                            "min(calc(100cqh / 8.8 * 0.6), calc(100cqw * 0.07))",
                        }}
                      >
                        <Money value={s.net} signed />
                      </span>
                    )}
                  </div>
                  <MonthGrid year={y} month={m} list={list} today={today} />
                </motion.button>
              );
            })}
          </div>
        </section>
      ))}
      <div className="flex justify-center pb-28">
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
