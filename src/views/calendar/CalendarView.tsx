import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ContactFilter } from "../../components/ContactFilter";
import { DaySheet } from "../../components/DaySheet";
import {
  ChevronLeft,
  DownloadIcon,
  FilterIcon,
  PlusIcon,
} from "../../components/icons";
import { Button, IconButton } from "../../components/ui";
import {
  type ContactWithBalance,
  type Entry,
  api,
  contactName,
  thresholdReached,
} from "../../lib/api";
import { navigate } from "../../lib/nav";
import { addMonths, monthRange, parseISO, todayISO } from "../../lib/dates";
import { zoomSpring } from "../../lib/motion";
import { visibleYears } from "../../lib/summary";
import { useApp } from "../../state";
import { DaysView } from "./DaysView";
import { MonthsView } from "./MonthsView";
import { YearsView } from "./YearsView";
import { useEntries } from "./useEntries";

type Level = "years" | "months" | "days";
const DEPTH: Record<Level, number> = { years: 0, months: 1, days: 2 };

interface ZoomCustom {
  dir: "in" | "out";
  ox: number;
  oy: number;
}

/** iPhone Takvim'deki yakınlaşma hissi: yeni seviye dokunulan karttan büyür, eskisi büyüyüp kaybolur. */
const layer = {
  initial: (c: ZoomCustom) => ({
    opacity: 0,
    scale: c.dir === "in" ? 0.4 : 1.9,
    originX: c.ox,
    originY: c.oy,
  }),
  animate: (c: ZoomCustom) => ({
    opacity: 1,
    scale: 1,
    originX: c.ox,
    originY: c.oy,
    transition: {
      ...zoomSpring,
      opacity: { duration: 0.22 },
      originX: { duration: 0 },
      originY: { duration: 0 },
    },
  }),
  exit: (c: ZoomCustom) => ({
    opacity: 0,
    scale: c.dir === "in" ? 1.9 : 0.4,
    originX: c.ox,
    originY: c.oy,
    transition: {
      ...zoomSpring,
      opacity: { duration: 0.18 },
      originX: { duration: 0 },
      originY: { duration: 0 },
    },
  }),
};

export function CalendarView() {
  const today = todayISO();
  const t = parseISO(today);
  const { editEntry, exportReport, version } = useApp();
  const [contacts, setContacts] = useState<ContactWithBalance[]>([]);

  const [level, setLevel] = useState<Level>("months");
  const [year, setYear] = useState(t.year);
  const [month, setMonth] = useState(t.month);
  const [zoom, setZoom] = useState<ZoomCustom>({ dir: "in", ox: 0.5, oy: 0.5 });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  /** Yakınlaşırken ölçülen kart konumları; uzaklaşırken aynı noktaya dönmek için */
  const origins = useRef(new Map<string, { ox: number; oy: number }>());

  // Tüm kayıtlar tek seferde yüklenir: seviyeler arası geçişte veri beklenmez, titreme olmaz.
  const { entries: allEntries } = useEntries("0000-01-01", "9999-12-31");
  // Firma/kişi filtresi: boşsa tüm hesap görünür
  const [filter, setFilter] = useState<Set<number>>(new Set());
  const [filterOpen, setFilterOpen] = useState(false);
  const entries = useMemo(
    () =>
      filter.size
        ? allEntries.filter((e) => filter.has(e.contact_id))
        : allEntries,
    [allEntries, filter],
  );

  useEffect(() => {
    api
      .listContacts()
      .then(setContacts)
      .catch(() => {});
  }, [version]);
  const reached = useMemo(() => contacts.filter(thresholdReached), [contacts]);

  const dataYears = useMemo(
    () => [...new Set(entries.map((e) => Number(e.date.slice(0, 4))))],
    [entries],
  );
  // Varsayılan olarak bugünden 10 yıl sonrasına kadar; daha ileri yıllar "daha fazla yıl" düğmesiyle açılır
  const [endYear, setEndYear] = useState(t.year + 10);
  const years = useMemo(
    () => visibleYears([...dataYears, year, endYear], t.year),
    [dataYears, year, endYear, t.year],
  );
  const moreYears = useCallback(
    () => setEndYear((e) => Math.max(e, years[years.length - 1]) + 10),
    [years],
  );

  const measure = (el: HTMLElement | null) => {
    const box = containerRef.current?.getBoundingClientRect();
    const r = el?.getBoundingClientRect();
    if (!box || !r || box.width === 0) return { ox: 0.5, oy: 0.5 };
    return {
      ox: (r.left + r.width / 2 - box.left) / box.width,
      oy: (r.top + r.height / 2 - box.top) / box.height,
    };
  };

  /** Ölçüm yoksa ızgaradaki konumdan tahmin */
  const estimate = (index: number, cols: number, rows: number) => ({
    ox: ((index % cols) + 0.5) / cols,
    oy: 0.14 + ((Math.floor(index / cols) + 0.5) / rows) * 0.84,
  });

  const zoomInto = (next: Level, key: string, el: HTMLElement | null) => {
    const o = measure(el);
    origins.current.set(key, o);
    setZoom({ dir: "in", ...o });
    setLevel(next);
  };

  const openYear = (y: number, el: HTMLElement | null) => {
    setYear(y);
    setMonth(y === t.year ? t.month : 0);
    zoomInto("months", `y${y}`, el);
  };

  const openMonth = (y: number, m: number, el: HTMLElement | null) => {
    setYear(y);
    setMonth(m);
    zoomInto("days", `m${y}-${m}`, el);
  };

  const goUp = useCallback(() => {
    if (selectedDay) {
      setSelectedDay(null);
      return;
    }
    if (level === "days") {
      const o =
        origins.current.get(`m${year}-${month}`) ?? estimate(month, 4, 3);
      setZoom({ dir: "out", ...o });
      setLevel("months");
    } else if (level === "months") {
      const idx = Math.max(0, years.indexOf(year));
      const o =
        origins.current.get(`y${year}`) ??
        estimate(idx, 4, Math.ceil(years.length / 4));
      setZoom({ dir: "out", ...o });
      setLevel("years");
    }
  }, [level, year, month, years, selectedDay]);

  const goToday = () => {
    const sameView = level === "days" && year === t.year && month === t.month;
    if (sameView) {
      setSelectedDay(today);
      return;
    }
    setSelectedDay(today);
    setZoom(
      DEPTH[level] < 2
        ? { dir: "in", ...estimate(t.month, 4, 3) }
        : { dir: "out", ox: 0.5, oy: 0.5 },
    );
    setYear(t.year);
    setMonth(t.month);
    setLevel("days");
  };

  const shiftMonth = useCallback(
    (delta: number) => {
      const n = addMonths(year, month, delta);
      setYear(n.year);
      setMonth(n.month);
    },
    [year, month],
  );

  // Klavye: ← → ay değiştir, Backspace bir üst seviye
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        selectedDay ||
        document.querySelector("[role=dialog],[role=alertdialog]")
      )
        return;
      if (level === "days" && e.key === "ArrowLeft") shiftMonth(-1);
      else if (level === "days" && e.key === "ArrowRight") shiftMonth(1);
      else if (e.key === "Backspace") goUp();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [level, shiftMonth, goUp, selectedDay]);

  // Ctrl + tekerlek geri (aşağı) ya da dokunmatik yüzeyde iki parmakla küçültme: bir üst seviyeye çık
  /** Panel Ctrl + tekerlekle yeni kapandıysa aynı hareket bir üst seviyeye de geçmesin */
  const sheetClosedAt = useRef(0);
  const goUpRef = useRef(goUp);
  goUpRef.current = goUp;
  useEffect(() => {
    const box = containerRef.current;
    if (!box) return;
    let last = 0;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      if (
        e.deltaY <= 0 ||
        Date.now() - last < 600 ||
        Date.now() - sheetClosedAt.current < 800
      )
        return;
      last = Date.now();
      goUpRef.current();
    };
    box.addEventListener("wheel", onWheel, { passive: false });
    return () => box.removeEventListener("wheel", onWheel);
  }, []);

  // Gün paneli açıkken Ctrl + tekerlek aşağı (ya da iki parmakla küçültme) paneli kapatır
  useEffect(() => {
    if (!selectedDay) return;
    let last = 0;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      if (e.deltaY <= 0 || Date.now() - last < 600) return;
      last = Date.now();
      sheetClosedAt.current = last;
      setSelectedDay(null);
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, [selectedDay]);

  const dayEntries: Entry[] = useMemo(
    () => (selectedDay ? entries.filter((e) => e.date === selectedDay) : []),
    [entries, selectedDay],
  );

  const backLabel =
    level === "days" ? String(year) : level === "months" ? "Yıllar" : null;

  return (
    <div className="h-full flex flex-col">
      {/* Araç çubuğu */}
      <div className="h-14 shrink-0 flex items-center justify-between px-4">
        <div className="min-w-0">
          <AnimatePresence mode="popLayout" initial={false}>
            {backLabel && (
              <motion.button
                key={backLabel}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={zoomSpring}
                onClick={goUp}
                className="flex items-center gap-0.5 h-9 pl-1 pr-3 rounded-xl text-blue text-[16px] hover:bg-fill transition-colors"
              >
                <ChevronLeft size={20} />
                {backLabel}
              </motion.button>
            )}
          </AnimatePresence>
        </div>
        <div className="flex items-center gap-1">
          {reached.length > 0 && (
            <button
              onClick={() => navigate("contacts", reached[0].id)}
              title="Tahsilat eşiğine ulaşan müşteriler"
              className="h-8 px-3 rounded-full bg-orange/15 text-orange text-[13px] font-semibold hover:bg-orange/25 transition-colors"
            >
              {reached.length === 1
                ? `${contactName(reached[0])} eşiğe ulaştı`
                : `${reached.length} firma eşiğe ulaştı`}
            </button>
          )}
          <IconButton
            label="Firma / kişi filtresi"
            onClick={() => setFilterOpen(true)}
            className={filter.size ? "text-blue bg-blue/10" : undefined}
          >
            <FilterIcon size={20} />
          </IconButton>
          <IconButton
            label="Tarih aralığı raporu"
            onClick={() => {
              const [from, to] =
                level === "years"
                  ? [`${t.year}-01-01`, `${t.year}-12-31`]
                  : level === "months"
                    ? [`${year}-01-01`, `${year}-12-31`]
                    : monthRange(year, month);
              exportReport({ kind: "range", from, to });
            }}
          >
            <DownloadIcon size={20} />
          </IconButton>
          <Button variant="plain" onClick={goToday}>
            Bugün
          </Button>
          <IconButton
            label="Yeni kayıt"
            onClick={() =>
              editEntry({
                date: level === "days" ? (selectedDay ?? undefined) : undefined,
              })
            }
          >
            <PlusIcon size={22} />
          </IconButton>
        </div>
      </div>

      {filter.size > 0 && (
        <div className="shrink-0 px-4 pb-2 flex items-center gap-2 text-[13px]">
          <span className="text-label2">Filtre:</span>
          <span className="truncate font-medium">
            {contacts
              .filter((c) => filter.has(c.id))
              .map(contactName)
              .join(", ")}
          </span>
          <button
            onClick={() => setFilter(new Set())}
            className="ml-auto text-blue hover:underline shrink-0"
          >
            Kaldır
          </button>
        </div>
      )}

      {/* Seviyeler */}
      <div
        ref={containerRef}
        className="relative flex-1 min-h-0 overflow-hidden"
      >
        <AnimatePresence initial={false} custom={zoom}>
          <motion.div
            key={level}
            custom={zoom}
            variants={layer}
            initial="initial"
            animate="animate"
            exit="exit"
            className="absolute inset-0 will-change-transform"
          >
            {level === "years" && (
              <YearsView
                years={years}
                entries={entries}
                currentYear={t.year}
                onOpen={openYear}
                onMoreYears={moreYears}
              />
            )}
            {level === "months" && (
              <MonthsView
                years={years}
                year={year}
                month={month}
                entries={entries}
                today={today}
                onOpen={openMonth}
                onYearChange={setYear}
                onMoreYears={moreYears}
              />
            )}
            {level === "days" && (
              <DaysView
                year={year}
                month={month}
                entries={entries}
                today={today}
                selectedDay={selectedDay}
                onSelectDay={setSelectedDay}
                onShift={shiftMonth}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <ContactFilter
        open={filterOpen}
        contacts={contacts}
        selected={filter}
        onChange={setFilter}
        onClose={() => setFilterOpen(false)}
      />
      <DaySheet
        date={selectedDay}
        entries={dayEntries}
        onClose={() => setSelectedDay(null)}
      />
    </div>
  );
}
