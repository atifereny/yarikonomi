import { AnimatePresence } from "framer-motion";
import { useRef } from "react";
import type { Entry } from "../lib/api";
import { formatDateTR } from "../lib/dates";
import { summarize } from "../lib/summary";
import { useApp } from "../state";
import { EntryRow } from "./EntryRow";
import { dayPeriod } from "../lib/report";
import { CalendarIcon, DownloadIcon, PlusIcon } from "./icons";
import { Button, Empty, IconButton, Money, Sheet } from "./ui";

/** Bir güne dokunulunca açılan alt panel */
export function DaySheet({
  date,
  entries,
  onClose,
}: {
  date: string | null;
  entries: Entry[];
  onClose: () => void;
}) {
  const { editEntry, exportReport } = useApp();
  const lastDate = useRef(date);
  if (date) lastDate.current = date;
  const d = date ?? lastDate.current;
  const s = summarize(entries);

  return (
    <Sheet open={!!date} onClose={onClose} variant="bottom">
      {d && (
        <>
          <div className="flex items-start justify-between gap-3 px-5 pt-1 pb-3">
            <div>
              <div className="text-[20px] font-bold tracking-tight">
                {formatDateTR(d, true)}
              </div>
              <div className="text-[13px] text-label2 mt-0.5 tabular">
                {s.count > 0 ? (
                  <>
                    {s.count} kayıt · Net{" "}
                    <Money value={s.net} signed className="font-semibold" />
                  </>
                ) : (
                  "Kayıt yok"
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <IconButton
                label="Günün raporunu indir"
                onClick={() =>
                  exportReport({ kind: "period", period: dayPeriod(d) })
                }
              >
                <DownloadIcon size={18} />
              </IconButton>
              <Button variant="plain" onClick={onClose} className="font-normal">
                Kapat
              </Button>
              <Button variant="primary" onClick={() => editEntry({ date: d })}>
                <PlusIcon size={16} /> Kayıt Ekle
              </Button>
            </div>
          </div>
          <div className="overflow-y-auto px-4 pb-6">
            {entries.length === 0 ? (
              <Empty
                icon={<CalendarIcon size={36} />}
                title="Bu gün için kayıt yok"
                text="Yeni bir alacak veya verecek ekleyebilirsiniz."
              />
            ) : (
              <div className="rounded-[12px] bg-card shadow-card overflow-hidden divide-y divide-sep">
                <AnimatePresence initial={false}>
                  {entries.map((e) => (
                    <EntryRow key={e.id} entry={e} />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </>
      )}
    </Sheet>
  );
}
