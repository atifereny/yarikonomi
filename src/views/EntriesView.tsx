import { AnimatePresence } from "framer-motion";
import { useMemo, useState } from "react";
import { trLower } from "../components/EntryForm";
import { EntryRow } from "../components/EntryRow";
import { ListIcon, PlusIcon, SearchIcon } from "../components/icons";
import {
  Button,
  Empty,
  IconButton,
  Money,
  Segmented,
  cx,
} from "../components/ui";
import { formatDateTR, todayISO } from "../lib/dates";
import { type Status, groupByDay, summarize } from "../lib/summary";
import { useApp } from "../state";
import { useEntries } from "./calendar/useEntries";

type Filter = "all" | Status;
type SortKey = "date" | "amount" | "contact";

const SORTS: { value: SortKey; label: string }[] = [
  { value: "date", label: "Tarih" },
  { value: "amount", label: "Tutar" },
  { value: "contact", label: "Firma / kişi" },
];

export function EntriesView() {
  const { editEntry } = useApp();
  const { entries, loaded } = useEntries("0000-01-01", "9999-12-31");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [onlyCheques, setOnlyCheques] = useState(false);
  const [onlyLoans, setOnlyLoans] = useState(false);
  const [sort, setSort] = useState<SortKey>("date");
  /** Tarihte varsayılan yeni → eski, tutarda çok → az, firmada A → Z */
  const [desc, setDesc] = useState(true);
  const today = todayISO();

  const { days, flat } = useMemo(() => {
    const s = trLower(q.trim());
    const list = entries.filter((e) => {
      if (filter !== "all" && e.status !== filter) return false;
      if (onlyCheques && !e.is_cheque) return false;
      if (onlyLoans && !e.is_loan) return false;
      return (
        !s ||
        trLower(
          `${e.contact_name} ${e.description} ${e.cheque_no} ${e.bank}`,
        ).includes(s)
      );
    });
    const dir = desc ? -1 : 1;
    if (sort === "date") {
      return {
        days: [...groupByDay(list)].sort(([a], [b]) =>
          a < b ? -dir : a > b ? dir : 0,
        ),
        flat: [],
      };
    }
    const cmp =
      sort === "amount"
        ? (a: (typeof list)[number], b: (typeof list)[number]) =>
            (a.amount - b.amount) * dir
        : (a: (typeof list)[number], b: (typeof list)[number]) =>
            a.contact_name.localeCompare(b.contact_name, "tr") * -dir;
    return {
      days: [],
      flat: [...list].sort((a, b) => cmp(a, b) || (a.date < b.date ? 1 : -1)),
    };
  }, [entries, q, filter, onlyCheques, onlyLoans, sort, desc]);

  const empty = sort === "date" ? days.length === 0 : flat.length === 0;

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 pt-3 pb-3 shrink-0">
        <div className="flex items-center justify-between h-10">
          <h1 className="text-[28px] font-bold tracking-tight">Kayıtlar</h1>
          <IconButton label="Yeni kayıt" onClick={() => editEntry({})}>
            <PlusIcon size={22} />
          </IconButton>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <div className="flex-1 flex items-center gap-2 px-2.5 h-9 rounded-[10px] bg-fill text-label2">
            <SearchIcon size={16} />
            <input
              className="flex-1 bg-transparent outline-none text-label placeholder:text-label3"
              placeholder="Kişi veya açıklama ara"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Segmented
            className="w-[380px]"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "Tümü" },
              {
                value: "odenmedi",
                label: "Ödenmedi",
                activeClass: "text-orange font-semibold",
              },
              {
                value: "odendi",
                label: "Ödendi",
                activeClass: "text-green font-semibold",
              },
              {
                value: "karsiliksiz",
                label: "Alınamadı",
                activeClass: "text-red font-semibold",
              },
            ]}
          />
        </div>
        <div className="mt-2.5 flex items-center gap-2 text-[13px]">
          <span className="text-label2">Sırala:</span>
          {SORTS.map((o) => (
            <button
              key={o.value}
              onClick={() =>
                sort === o.value
                  ? setDesc((d) => !d)
                  : (setSort(o.value), setDesc(o.value !== "contact"))
              }
              className={cx(
                "h-7 px-3 rounded-full transition-colors",
                sort === o.value
                  ? "bg-blue text-white font-medium"
                  : "bg-fill text-label hover:bg-fill2",
              )}
            >
              {o.label}
              {sort === o.value && (
                <span className="ml-1">{desc ? "↓" : "↑"}</span>
              )}
            </button>
          ))}
          <span className="flex-1" />
          <button
            onClick={() => setOnlyCheques((v) => !v)}
            className={cx(
              "h-7 px-3 rounded-full transition-colors",
              onlyCheques
                ? "bg-orange text-white font-medium"
                : "bg-fill text-label hover:bg-fill2",
            )}
          >
            Sadece çekler
          </button>
          <button
            onClick={() => setOnlyLoans((v) => !v)}
            className={cx(
              "h-7 px-3 rounded-full transition-colors",
              onlyLoans
                ? "bg-blue text-white font-medium"
                : "bg-fill text-label hover:bg-fill2",
            )}
          >
            Sadece krediler
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto fade-top px-6 pb-28">
        {loaded && empty ? (
          <Empty
            icon={<ListIcon size={36} />}
            title={entries.length === 0 ? "Henüz kayıt yok" : "Sonuç yok"}
            text={
              entries.length === 0
                ? "İlk alacak ya da verecek kaydınızı ekleyin."
                : undefined
            }
          >
            {entries.length === 0 && (
              <Button variant="primary" onClick={() => editEntry({})}>
                <PlusIcon size={16} /> Kayıt Ekle
              </Button>
            )}
          </Empty>
        ) : sort !== "date" ? (
          <div className="rounded-[12px] bg-card shadow-card overflow-hidden divide-y divide-sep">
            <AnimatePresence initial={false}>
              {flat.map((e) => (
                <EntryRow key={e.id} entry={e} showDate />
              ))}
            </AnimatePresence>
          </div>
        ) : (
          days.map(([date, list]) => {
            const s = summarize(list);
            return (
              <section key={date} className="mb-5">
                <div className="flex items-baseline justify-between px-4 mb-1.5">
                  <h3 className="text-[13px] font-semibold text-label2">
                    {formatDateTR(date, true)}
                    {date === today && (
                      <span className="ml-2 text-blue">Bugün</span>
                    )}
                  </h3>
                  <span className="text-[12px] font-semibold">
                    <Money value={s.net} signed />
                  </span>
                </div>
                <div className="rounded-[12px] bg-card shadow-card overflow-hidden divide-y divide-sep">
                  <AnimatePresence initial={false}>
                    {list.map((e) => (
                      <EntryRow key={e.id} entry={e} />
                    ))}
                  </AnimatePresence>
                </div>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}
