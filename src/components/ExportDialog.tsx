import { useEffect, useMemo, useRef, useState } from "react";
import {
  type ContactWithBalance,
  type Entry,
  api,
  contactName,
  errorText,
} from "../lib/api";
import { parseISO, todayISO } from "../lib/dates";
import {
  type ExportFormat,
  readFormat,
  saveReport,
  writeFormat,
} from "../lib/export";
import { formatTL } from "../lib/money";
import {
  type Period,
  type Report,
  buildPeriodReport,
  buildStatement,
  rangePeriod,
} from "../lib/report";
import { summarize } from "../lib/summary";
import { useApp } from "../state";
import { DateField } from "./DateField";
import { trLower } from "./EntryForm";
import { SearchIcon } from "./icons";
import { Button, Group, Money, Segmented, Sheet, SheetHeader, cx } from "./ui";

/** Dönem raporu (yıl / ay / hafta / gün) ya da bir kişinin cari ekstresi */
export type ExportRequest =
  | { kind: "period"; period: Period }
  | { kind: "statement"; contactId?: number }
  /** Serbest tarih aralığı raporu; başlangıç değerleri isteğe bağlı */
  | { kind: "range"; from?: string; to?: string };

type RangeMode = "all" | "year" | "custom";

export function ExportDialog({
  request,
  onClose,
}: {
  request: ExportRequest | null;
  onClose: () => void;
}) {
  // Kapanış animasyonunda içerik kaybolmasın
  const last = useRef(request);
  if (request) last.current = request;
  const req = request ?? last.current;
  const [preview, setPreview] = useState<Preview | null>(null);

  // Pencere kapanınca önizleme belleği boşaltılır
  useEffect(() => {
    if (!request && preview) {
      URL.revokeObjectURL(preview.url);
      setPreview(null);
    }
  }, [request, preview]);

  const closePreview = () => {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
  };

  return (
    <Sheet
      open={!!request}
      onClose={preview ? closePreview : onClose}
      width={preview ? 1600 : 480}
    >
      {preview ? (
        <PreviewBody
          preview={preview}
          onBack={closePreview}
          onClose={onClose}
        />
      ) : (
        <>
          {req?.kind === "period" && (
            <PeriodBody
              period={req.period}
              onClose={onClose}
              onPreview={setPreview}
            />
          )}
          {req?.kind === "range" && (
            <RangeBody
              from={req.from}
              to={req.to}
              onClose={onClose}
              onPreview={setPreview}
            />
          )}
          {req?.kind === "statement" && (
            <StatementBody
              contactId={req.contactId}
              onClose={onClose}
              onPreview={setPreview}
            />
          )}
        </>
      )}
    </Sheet>
  );
}

interface Preview {
  report: Report;
  /** PDF'in blob adresi */
  url: string;
}

/** PDF görüntüleyici tarzı önizleme: sayfa düzeni indirilecek dosyayla aynıdır */
function PreviewBody({
  preview,
  onBack,
  onClose,
}: {
  preview: Preview;
  onBack: () => void;
  onClose: () => void;
}) {
  const { toast } = useApp();
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      const path = await saveReport(preview.report, "pdf");
      if (path) {
        toast(`Kaydedildi: ${path}`);
        onClose();
      }
    } catch (e) {
      toast(`Dosya oluşturulamadı: ${errorText(e)}`, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SheetHeader
        title="Önizleme"
        cancelLabel="Geri"
        onCancel={onBack}
        action={
          <Button variant="plain" onClick={onClose}>
            Kapat
          </Button>
        }
      />
      <div
        className="shrink-0 bg-fill2/40 p-3"
        style={{ height: "calc(90vh - 160px)" }}
      >
        <iframe
          title="PDF önizleme"
          src={`${preview.url}#toolbar=0&navpanes=0`}
          className="w-full h-full rounded-[10px] bg-white"
        />
      </div>
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-sep">
        <span className="text-[13px] text-label2">PDF olarak indirilir</span>
        <Button variant="primary" disabled={busy} onClick={download}>
          {busy ? "Hazırlanıyor…" : "İndir"}
        </Button>
      </div>
    </>
  );
}

function FormatPicker({
  value,
  onChange,
}: {
  value: ExportFormat;
  onChange: (f: ExportFormat) => void;
}) {
  return (
    <Group title="Dosya türü">
      <div className="p-2">
        <Segmented
          value={value}
          onChange={onChange}
          options={[
            { value: "excel", label: "Excel (.xlsx)" },
            { value: "pdf", label: "PDF" },
          ]}
        />
      </div>
    </Group>
  );
}

function useSaver(onClose: () => void, onPreview: (p: Preview) => void) {
  const { toast } = useApp();
  const [busy, setBusy] = useState(false);
  const [format, setFormat] = useState<ExportFormat>(readFormat);

  const pick = (f: ExportFormat) => {
    setFormat(f);
    writeFormat(f);
  };

  const run = async (make: () => Promise<Parameters<typeof saveReport>[0]>) => {
    setBusy(true);
    try {
      const path = await saveReport(await make(), format);
      if (path) {
        toast(`Kaydedildi: ${path}`);
        onClose();
      }
    } catch (e) {
      toast(`Dosya oluşturulamadı: ${errorText(e)}`, "error");
    } finally {
      setBusy(false);
    }
  };
  /** Raporu PDF olarak üretir ve indirmeden önce önizlemede gösterir */
  const preview = async (
    make: () => Promise<Parameters<typeof saveReport>[0]>,
  ) => {
    setBusy(true);
    try {
      const report = await make();
      const bytes = await (await import("../lib/export/pdf")).buildPdf(report);
      const url = URL.createObjectURL(
        new Blob([bytes as BlobPart], { type: "application/pdf" }),
      );
      onPreview({ report, url });
    } catch (e) {
      toast(`Önizleme oluşturulamadı: ${errorText(e)}`, "error");
    } finally {
      setBusy(false);
    }
  };
  return { busy, format, pick, run, preview };
}

function ActionButtons({
  busy,
  disabled,
  onPreview,
  onDownload,
}: {
  busy: boolean;
  disabled: boolean;
  onPreview: () => void;
  onDownload: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <Button variant="plain" disabled={busy || disabled} onClick={onPreview}>
        Önizle
      </Button>
      <Button
        variant="primary"
        disabled={busy || disabled}
        onClick={onDownload}
      >
        {busy ? "Hazırlanıyor…" : "İndir"}
      </Button>
    </div>
  );
}

function PeriodBody({
  period,
  onClose,
  onPreview,
  extra,
  invalid,
}: {
  period: Period;
  onClose: () => void;
  onPreview: (p: Preview) => void;
  /** Bilgi kartının üstünde gösterilecek ek alanlar (ör. tarih aralığı seçici) */
  extra?: React.ReactNode;
  invalid?: boolean;
}) {
  const { toast, version } = useApp();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const saver = useSaver(onClose, onPreview);
  const make = async () =>
    buildPeriodReport(period, await api.listEntries(period.from, period.to));

  useEffect(() => {
    let alive = true;
    api
      .listEntries(period.from, period.to)
      .then((l) => alive && setEntries(l))
      .catch((e) => toast(String(e), "error"));
    return () => {
      alive = false;
    };
  }, [period.from, period.to, version, toast]);

  const s = entries ? summarize(entries) : null;

  return (
    <>
      <SheetHeader
        title="Rapor indir"
        onCancel={onClose}
        action={
          <ActionButtons
            busy={saver.busy}
            disabled={!entries || !!invalid}
            onPreview={() => saver.preview(make)}
            onDownload={() => saver.run(make)}
          />
        }
      />
      <div className="overflow-y-auto p-4">
        {extra}
        <div className="mb-5 rounded-[14px] bg-card shadow-card px-4 py-3">
          <div className="text-[17px] font-semibold">{period.title}</div>
          <div className="text-[13px] text-label2 tabular mt-0.5">
            {s ? (
              s.count > 0 ? (
                <>
                  {s.count} kayıt · Net{" "}
                  <Money value={s.net} signed className="font-semibold" />
                </>
              ) : (
                "Bu dönemde kayıt yok"
              )
            ) : (
              "Yükleniyor…"
            )}
          </div>
        </div>
        <FormatPicker value={saver.format} onChange={saver.pick} />
        <p className="px-4 -mt-3 text-[12px] text-label2 leading-snug">
          {period.kind === "year"
            ? "Yıllık özet (aylara göre) ve tüm kayıtlar."
            : "Bu dönemdeki tüm kayıtlar; toplam alacak, verecek, net ve bekleyen tutarlarla."}
        </p>
      </div>
    </>
  );
}

function RangeBody({
  from: from0,
  to: to0,
  onClose,
  onPreview,
}: {
  from?: string;
  to?: string;
  onClose: () => void;
  onPreview: (p: Preview) => void;
}) {
  const today = todayISO();
  const [from, setFrom] = useState(from0 ?? `${parseISO(today).year}-01-01`);
  const [to, setTo] = useState(to0 ?? today);
  const invalid = from > to;
  return (
    <PeriodBody
      period={rangePeriod(from, to)}
      onClose={onClose}
      onPreview={onPreview}
      invalid={invalid}
      extra={
        <>
          <Group title="Tarih aralığı">
            <DateField label="Başlangıç" value={from} onChange={setFrom} />
            <DateField label="Bitiş" value={to} onChange={setTo} />
          </Group>
          {invalid && (
            <p className="px-4 -mt-4 mb-4 text-[12px] text-red">
              Başlangıç tarihi bitişten sonra olamaz.
            </p>
          )}
        </>
      }
    />
  );
}

function StatementBody({
  contactId,
  onClose,
  onPreview,
}: {
  contactId?: number;
  onClose: () => void;
  onPreview: (p: Preview) => void;
}) {
  const { toast } = useApp();
  const [contacts, setContacts] = useState<ContactWithBalance[]>([]);
  const [selected, setSelected] = useState<number | null>(contactId ?? null);
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<RangeMode>("all");
  const today = todayISO();
  const [from, setFrom] = useState(`${parseISO(today).year}-01-01`);
  const [to, setTo] = useState(today);
  const saver = useSaver(onClose, onPreview);

  useEffect(() => {
    api
      .listContacts()
      .then((l) =>
        setContacts(
          l.sort((a, b) => contactName(a).localeCompare(contactName(b), "tr")),
        ),
      )
      .catch((e) => toast(String(e), "error"));
  }, [toast]);

  const list = useMemo(() => {
    const s = trLower(q.trim());
    return s
      ? contacts.filter((c) => trLower(`${c.name} ${c.company}`).includes(s))
      : contacts;
  }, [contacts, q]);

  const contact = contacts.find((c) => c.id === selected) ?? null;
  const rangeInvalid = mode === "custom" && from > to;

  const make = async () => {
    const c = contact!;
    const entries = await api.listContactEntries(c.id);
    const year = parseISO(today).year;
    const range =
      mode === "all"
        ? { from: null, to: null }
        : mode === "year"
          ? { from: `${year}-01-01`, to: `${year}-12-31` }
          : { from, to };
    return buildStatement(c, entries, range);
  };

  return (
    <>
      <SheetHeader
        title="Cari ekstre"
        onCancel={onClose}
        action={
          <ActionButtons
            busy={saver.busy}
            disabled={!contact || rangeInvalid}
            onPreview={() => saver.preview(make)}
            onDownload={() => saver.run(make)}
          />
        }
      />
      <div className="overflow-y-auto p-4">
        <Group title="Kişi / firma">
          <div className="flex items-center gap-2 mx-3 my-2 px-2.5 h-8 rounded-[9px] bg-fill text-label2">
            <SearchIcon size={15} />
            <input
              autoFocus={!contactId}
              className="flex-1 bg-transparent outline-none text-label placeholder:text-label3"
              placeholder="Ara"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="max-h-52 overflow-y-auto">
            {list.length === 0 ? (
              <div className="px-4 py-3 text-[13px] text-label2">
                {contacts.length === 0 ? "Henüz kişi yok." : "Sonuç yok."}
              </div>
            ) : (
              list.map((c) => {
                const net = c.open_receivable - c.open_payable;
                return (
                  <button
                    type="button"
                    key={c.id}
                    onClick={() => setSelected(c.id)}
                    className={cx(
                      "w-full flex items-center gap-3 px-4 min-h-11 py-2 text-left hover:bg-fill/60 transition-colors",
                      c.id === selected && "bg-blue/10",
                    )}
                  >
                    <span
                      className={cx(
                        "flex-1 truncate",
                        c.id === selected && "font-semibold text-blue",
                      )}
                    >
                      {contactName(c)}
                    </span>
                    <span className="text-[12px] text-label2 tabular">
                      {net !== 0 ? formatTL(Math.abs(net)) : ""}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </Group>

        <Group title="Dönem">
          <div className="p-2">
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: "all", label: "Tüm kayıtlar" },
                { value: "year", label: "Bu yıl" },
                { value: "custom", label: "Tarih aralığı" },
              ]}
            />
          </div>
          {mode === "custom" && (
            <>
              <DateField label="Başlangıç" value={from} onChange={setFrom} />
              <DateField label="Bitiş" value={to} onChange={setTo} />
            </>
          )}
        </Group>
        {rangeInvalid && (
          <p className="px-4 -mt-4 mb-4 text-[12px] text-red">
            Başlangıç tarihi bitişten sonra olamaz.
          </p>
        )}

        <FormatPicker value={saver.format} onChange={saver.pick} />
        <p className="px-4 -mt-3 text-[12px] text-label2 leading-snug">
          Tüm hareketler tarih sırasıyla, kalan bakiye ve özet toplamlarla
          birlikte.
        </p>
      </div>
    </>
  );
}
