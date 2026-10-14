import { motion } from "framer-motion";
import { type Entry, api } from "../lib/api";
import { statusText } from "../lib/status";
import type { Status } from "../lib/summary";
import { formatDateShort } from "../lib/dates";
import { spring } from "../lib/motion";
import { useApp, useRunner } from "../state";
import { formatTL } from "../lib/money";
import { CheckIcon, PencilIcon, PlusIcon, TrashIcon, XIcon } from "./icons";
import { DirectionAmount, IconButton, StatusPill, cx } from "./ui";

export function EntryRow({
  entry,
  showDate,
  showContact = true,
}: {
  entry: Entry;
  showDate?: boolean;
  showContact?: boolean;
}) {
  const { bump, editEntry, addPayment, confirm } = useApp();
  const run = useRunner();
  const paid = entry.status === "odendi";
  const lateCollected = entry.status === "karsiliksiz" && !!entry.paid_date;
  const failed = entry.status === "karsiliksiz" && !lateCollected;
  const txt = statusText(entry.direction, entry.is_cheque);
  const uncertain = entry.undated && entry.status === "odenmedi";
  const partial = entry.status === "odenmedi" && entry.paid_amount > 0;
  const canPartPay = entry.status === "odenmedi" && !entry.is_cheque;

  const setStatus = async (status: Status) => {
    const label = status === "odendi" ? txt.done : txt.failed;
    const r = await run(
      () => api.setEntryStatus(entry.id, status),
      `${label} olarak işaretlendi`,
    );
    if (r !== undefined) bump();
  };

  const togglePaid = async () => {
    const r = await run(
      () => api.setEntryPaid(entry.id, !paid && !failed && !lateCollected),
      paid || failed || lateCollected
        ? `${txt.pending} olarak işaretlendi`
        : `${txt.done} olarak işaretlendi`,
    );
    if (r !== undefined) bump();
  };

  const remove = async () => {
    if (
      !(await confirm({
        title: "Kayıt silinsin mi?",
        message: "Bu işlem geri alınamaz.",
        confirmText: "Sil",
        destructive: true,
      }))
    )
      return;
    if (
      (await run(() => api.deleteEntry(entry.id), "Kayıt silindi")) !==
      undefined
    )
      bump();
  };

  const title = showContact
    ? entry.contact_name
    : entry.description ||
      (entry.direction === "alacak" ? "Alacak" : "Verecek");
  const subtitle = [
    showDate && formatDateShort(entry.date),
    entry.is_cheque &&
      [entry.cheque_no && `No ${entry.cheque_no}`, entry.bank]
        .filter(Boolean)
        .join(" "),
    entry.is_loan && entry.bank,
    showContact && entry.description,
    partial &&
      `${entry.direction === "alacak" ? "Tahsil edilen" : "Ödenen"} ${formatTL(entry.paid_amount)} · Kalan ${formatTL(entry.amount - entry.paid_amount)}`,
    paid && entry.paid_date && `Ödeme: ${formatDateShort(entry.paid_date)}`,
    lateCollected &&
      `${formatDateShort(entry.paid_date!)} tarihli kayıtla ${txt.done.toLocaleLowerCase("tr")}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={spring}
      className={cx(
        "group flex items-center gap-3 px-4 py-2.5 hover:bg-fill/50 transition-colors",
        uncertain && "opacity-70",
      )}
      onDoubleClick={() => editEntry({ entry })}
    >
      <motion.button
        whileTap={{ scale: 0.8 }}
        transition={spring}
        onClick={togglePaid}
        title={paid ? "Ödenmedi olarak işaretle" : "Ödendi olarak işaretle"}
        className={cx(
          "w-[22px] h-[22px] shrink-0 rounded-full border-2 flex items-center justify-center transition-colors",
          paid
            ? "bg-green border-green text-white"
            : lateCollected
              ? "bg-green/50 border-green/50 text-white"
              : failed
                ? "bg-red border-red text-white"
                : "border-label3 hover:border-green",
        )}
      >
        {paid && <CheckIcon size={13} />}
        {failed && <XIcon size={12} />}
        {lateCollected && <CheckIcon size={13} />}
      </motion.button>
      <div className="flex-1 min-w-0" onClick={() => editEntry({ entry })}>
        <div
          className={cx(
            "truncate font-medium flex items-center gap-1.5",
            paid && "text-label2",
          )}
        >
          <span className="truncate">{title}</span>
          {uncertain && (
            <span
              title="Bu kişinin ödeme zamanı belirsiz: takvim toplamlarına girmez"
              className="shrink-0 rounded-full bg-fill2 text-label2 px-1.5 py-px text-[10px] font-semibold leading-tight"
            >
              VADESİZ
            </span>
          )}
          {entry.is_loan && (
            <span className="shrink-0 rounded-full bg-blue/15 text-blue px-1.5 py-px text-[10px] font-semibold leading-tight">
              KREDİ
            </span>
          )}
          {entry.is_cheque && (
            <span className="shrink-0 rounded-full bg-orange/15 text-orange px-1.5 py-px text-[10px] font-semibold leading-tight">
              ÇEK{!showDate && ` · vade ${formatDateShort(entry.date)}`}
            </span>
          )}
        </div>
        {subtitle && (
          <div className="truncate text-[12px] text-label2">{subtitle}</div>
        )}
      </div>
      <div
        className="flex flex-col items-end gap-0.5 shrink-0"
        onClick={() => editEntry({ entry })}
      >
        <DirectionAmount
          direction={entry.direction}
          amount={entry.amount}
          className={cx(
            (paid || failed || lateCollected) &&
              "opacity-50 line-through decoration-1",
          )}
        />
        {paid && <StatusPill tone="paid">{txt.done}</StatusPill>}
        {failed && <StatusPill tone="failed">{txt.failed}</StatusPill>}
        {lateCollected && (
          <StatusPill tone="paid">
            Sonradan {txt.done.toLocaleLowerCase("tr")}
          </StatusPill>
        )}
        {entry.status === "odenmedi" && (
          <StatusPill tone="pending">
            {partial ? "Kısmen" : txt.pending}
          </StatusPill>
        )}
      </div>
      {entry.is_cheque && !paid && !lateCollected && (
        <div className="flex gap-1.5 shrink-0">
          <button
            onClick={() => setStatus("odendi")}
            className="h-7 px-2.5 rounded-full bg-green/15 text-green text-[12px] font-semibold hover:bg-green/25 transition-colors"
          >
            {txt.doneAction}
          </button>
          {!failed && (
            <button
              onClick={() => setStatus("karsiliksiz")}
              className="h-7 px-2.5 rounded-full bg-red/15 text-red text-[12px] font-semibold hover:bg-red/25 transition-colors"
            >
              {txt.failAction}
            </button>
          )}
        </div>
      )}
      <div className="flex opacity-0 group-hover:opacity-100 transition-opacity -mr-2">
        {canPartPay && (
          <IconButton
            label={
              entry.direction === "alacak"
                ? "Kısmi tahsilat ekle"
                : "Kısmi ödeme ekle"
            }
            onClick={() => addPayment({ kind: "entry", entry })}
            className="w-8 h-8"
          >
            <PlusIcon size={16} />
          </IconButton>
        )}
        <IconButton
          label="Düzenle"
          onClick={() => editEntry({ entry })}
          className="w-8 h-8"
        >
          <PencilIcon size={16} />
        </IconButton>
        <IconButton label="Sil" onClick={remove} className="w-8 h-8 text-red">
          <TrashIcon size={16} />
        </IconButton>
      </div>
    </motion.div>
  );
}
