import { useEffect, useMemo, useRef, useState } from "react";
import {
  type ContactWithBalance,
  type Entry,
  api,
  contactName,
} from "../lib/api";
import { formatDateShort, todayISO } from "../lib/dates";
import { formatTL, kurusToInput, parseTL } from "../lib/money";
import type { Direction } from "../lib/summary";
import { useApp, useRunner } from "../state";
import { DateField } from "./DateField";
import { AmountInput } from "./EntryForm";
import { Button, Group, Sheet, SheetHeader } from "./ui";

/** Tek bir kayda kısmi ödeme ya da bir kişinin açık kayıtlarına en eskiden başlayarak toplu ödeme / tahsilat */
export type PaymentRequest =
  | { kind: "entry"; entry: Entry }
  | { kind: "contact"; contact: ContactWithBalance; direction: Direction };

export function PaymentDialog({
  request,
  onClose,
}: {
  request: PaymentRequest | null;
  onClose: () => void;
}) {
  const last = useRef<PaymentRequest | null>(null);
  const openCount = useRef(0);
  if (request && request !== last.current) {
    last.current = request;
    openCount.current++;
  }
  const r = request ?? last.current;
  return (
    <Sheet open={!!request} onClose={onClose} width={480}>
      {r && <Body key={openCount.current} request={r} onClose={onClose} />}
    </Sheet>
  );
}

function Body({
  request,
  onClose,
}: {
  request: PaymentRequest;
  onClose: () => void;
}) {
  const { bump } = useApp();
  const run = useRunner();
  const direction =
    request.kind === "entry" ? request.entry.direction : request.direction;
  const incoming = direction === "alacak";
  const [text, setText] = useState("");
  const [date, setDate] = useState(todayISO());
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState<Entry[] | null>(
    request.kind === "entry" ? [] : null,
  );

  // Toplu işlemde en eski faturadan başlayarak dağıtım önizlemesi için açık kayıtlar
  useEffect(() => {
    if (request.kind !== "contact") return;
    let alive = true;
    api.listContactEntries(request.contact.id).then((l) => {
      if (!alive) return;
      setOpen(
        l
          .filter(
            (e) =>
              e.direction === direction &&
              e.status === "odenmedi" &&
              !e.is_cheque,
          )
          .sort((a, b) =>
            a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id,
          ),
      );
    });
    return () => {
      alive = false;
    };
  }, [request, direction]);

  const remainingOf = (e: Entry) => e.amount - e.paid_amount;
  const max =
    request.kind === "entry"
      ? remainingOf(request.entry)
      : (open ?? []).reduce((a, e) => a + remainingOf(e), 0);
  const amount = parseTL(text);
  const valid = amount !== null && amount > 0 && amount <= max;

  const plan = useMemo(() => {
    if (request.kind !== "contact" || !open || !valid) return null;
    let left = amount!;
    let closed = 0;
    let partial = 0;
    for (const e of open) {
      if (left <= 0) break;
      if (left >= remainingOf(e)) {
        left -= remainingOf(e);
        closed++;
      } else {
        left = 0;
        partial++;
      }
    }
    return { closed, partial };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, amount, valid, request.kind]);

  const title =
    request.kind === "entry"
      ? incoming
        ? "Kısmi tahsilat"
        : "Kısmi ödeme"
      : incoming
        ? "Tahsilat al"
        : "Ödeme yap";

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    const r = await run(
      async () => {
        if (request.kind === "entry") await api.addPayment(request.entry.id, amount!, date);
        else await api.collectPayment(request.contact.id, direction, amount!, date);
      },
      incoming ? "Tahsilat kaydedildi" : "Ödeme kaydedildi",
    );
    setSaving(false);
    if (r !== undefined) {
      bump();
      onClose();
    }
  };

  return (
    <form
      className="flex flex-col min-h-0"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <SheetHeader
        title={title}
        onCancel={onClose}
        action={
          <Button variant="plain" type="submit" disabled={!valid || saving}>
            Kaydet
          </Button>
        }
      />
      <div className="overflow-y-auto px-4 pt-5 pb-4">
        <div className="mb-5 rounded-[12px] bg-card shadow-card px-4 py-3">
          {request.kind === "entry" ? (
            <>
              <div className="font-semibold">{request.entry.contact_name}</div>
              <div className="text-[13px] text-label2 tabular">
                {formatDateShort(request.entry.date)}
                {request.entry.description && ` · ${request.entry.description}`}
              </div>
              <div className="mt-1.5 text-[13px] tabular">
                Toplam {formatTL(request.entry.amount)} ·{" "}
                {incoming ? "Tahsil edilen" : "Ödenen"}{" "}
                {formatTL(request.entry.paid_amount)} ·{" "}
                <b>Kalan {formatTL(max)}</b>
              </div>
            </>
          ) : (
            <>
              <div className="font-semibold">
                {contactName(request.contact)}
              </div>
              <div className="text-[13px] text-label2 tabular">
                {open === null
                  ? "Yükleniyor…"
                  : `${open.length} açık kayıt · ${formatTL(max)}`}
              </div>
              <div className="mt-1 text-[12px] text-label2">
                Tutar en eski tarihli kayıttan başlayarak dağıtılır. Çekler
                dahil değildir.
              </div>
            </>
          )}
        </div>

        <div className="mb-5 rounded-[12px] bg-card shadow-card px-4 py-4 text-center">
          <div className="text-[12px] text-label2 mb-1">
            {incoming ? "Tahsil edilen tutar" : "Ödenen tutar"}
          </div>
          <AmountInput
            value={text}
            onChange={setText}
            autoFocus
            startOpen
            amount={amount}
            className={incoming ? "text-green" : "text-red"}
          />
          <button
            type="button"
            disabled={max <= 0}
            onClick={() => setText(kurusToInput(max))}
            className="mt-2 text-[13px] text-blue hover:underline disabled:opacity-40"
          >
            Tamamı ({formatTL(max)})
          </button>
          {text.trim() !== "" && amount !== null && amount > max && (
            <div className="mt-1 text-[12px] text-red">
              Tutar kalan {formatTL(max)} değerinden fazla olamaz.
            </div>
          )}
        </div>

        <Group
          footer={
            plan
              ? `${plan.closed > 0 ? `${plan.closed} kayıt tamamen kapanır` : ""}${plan.closed > 0 && plan.partial > 0 ? ", " : ""}${plan.partial > 0 ? "1 kayıt kısmen ödenmiş olur" : ""}.`
              : undefined
          }
        >
          <DateField label="Tarih" value={date} onChange={setDate} />
        </Group>
      </div>
    </form>
  );
}
