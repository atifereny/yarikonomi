import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { DateField } from "./DateField";
import {
  type ContactWithBalance,
  type Entry,
  type EntryInput,
  api,
  contactName,
} from "../lib/api";
import { formatDateShort, todayISO } from "../lib/dates";
import { formatTL, kurusToInput, parseTL } from "../lib/money";
import { BANKS } from "../lib/banks";
import { spring } from "../lib/motion";
import { statusText } from "../lib/status";
import type { Direction, Status } from "../lib/summary";
import { type EntryEditorRequest, useApp, useRunner } from "../state";
import { CheckIcon, ChevronRight, PlusIcon, SearchIcon } from "./icons";
import {
  Button,
  FieldRow,
  Group,
  Row,
  Segmented,
  Sheet,
  SheetHeader,
  cx,
  inputClass,
} from "./ui";

export function EntryForm({
  request,
  onClose,
}: {
  request: EntryEditorRequest | null;
  onClose: () => void;
}) {
  const last = useRef<EntryEditorRequest | null>(null);
  const openCount = useRef(0);
  if (request && request !== last.current) {
    last.current = request;
    openCount.current++;
  }
  const r = request ?? last.current;
  return (
    <Sheet open={!!request} onClose={onClose} width={500}>
      {r && (
        <EntryFormBody key={openCount.current} request={r} onClose={onClose} />
      )}
    </Sheet>
  );
}

export const trLower = (s: string) => s.toLocaleLowerCase("tr");

function EntryFormBody({
  request,
  onClose,
}: {
  request: EntryEditorRequest;
  onClose: () => void;
}) {
  const { bump, confirm } = useApp();
  const run = useRunner();
  const editing = request.entry;

  const [contacts, setContacts] = useState<ContactWithBalance[]>([]);
  const [contactId, setContactId] = useState<number | null>(
    editing?.contact_id ?? request.contactId ?? null,
  );
  const [direction, setDirection] = useState<Direction>(
    editing?.direction ?? "alacak",
  );
  const [amountText, setAmountText] = useState(
    editing ? kurusToInput(editing.amount) : "",
  );
  const [date, setDate] = useState(editing?.date ?? request.date ?? todayISO());
  const [description, setDescription] = useState(editing?.description ?? "");
  const [status, setStatus] = useState<Status>(editing?.status ?? "odenmedi");
  const [paidDate, setPaidDate] = useState(editing?.paid_date ?? todayISO());
  const [isCheque, setIsCheque] = useState(editing?.is_cheque ?? false);
  const [isLoan, setIsLoan] = useState(editing?.is_loan ?? false);
  const [chequeNo, setChequeNo] = useState(editing?.cheque_no ?? "");
  const [bank, setBank] = useState(editing?.bank ?? "");
  const [picking, setPicking] = useState(!editing && !request.contactId);
  const [saving, setSaving] = useState(false);
  /** Bu kaydın tarihinde alınmış olarak işaretlenecek eski çekler */
  const [collect, setCollect] = useState<Set<number>>(new Set());
  const [contactEntries, setContactEntries] = useState<Entry[]>([]);

  useEffect(() => {
    setCollect(new Set());
    if (contactId === null) {
      setContactEntries([]);
      return;
    }
    let alive = true;
    api
      .listContactEntries(contactId)
      .then((l) => alive && setContactEntries(l))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [contactId]);

  const sumOf = (ids: Set<number>) =>
    openCheques.filter((c) => ids.has(c.id)).reduce((t, c) => t + c.amount, 0);

  /** Çek seçilince tutar alanı seçilen çeklerin toplamıyla otomatik dolar */
  const toggleCheque = (id: number) => {
    const next = new Set(collect);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    const prevSum = sumOf(collect);
    const sum = sumOf(next);
    setCollect(next);
    if (sum > 0) setAmountText(kurusToInput(sum));
    else if (parseTL(amountText) === prevSum) setAmountText("");
  };

  /** Bu kişinin, seçili tarihten önce vadesi gelmiş ama alınmamış / ödenmemiş çekleri */
  const openCheques = contactEntries.filter(
    (e) =>
      e.is_cheque &&
      e.status !== "odendi" &&
      !(e.status === "karsiliksiz" && e.paid_date) &&
      e.id !== editing?.id &&
      e.date < date,
  );

  useEffect(() => {
    api
      .listContacts()
      .then((list) =>
        setContacts(
          list.sort((a, b) =>
            contactName(a).localeCompare(contactName(b), "tr"),
          ),
        ),
      )
      .catch(() => {});
  }, []);

  const amount = parseTL(amountText);
  const selected = contacts.find((c) => c.id === contactId);
  const valid =
    amount !== null &&
    amount > 0 &&
    (isLoan ? bank.trim() !== "" : contactId !== null) &&
    !!date;

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    let cid = contactId;
    if (isLoan) {
      // Kredi ödemesi seçilen bankanın kişisine bağlanır; yoksa tüzel kişi olarak açılır
      const name = bank.trim();
      const existing = contacts.find(
        (c) =>
          c.company.trim().toLocaleLowerCase("tr") ===
          name.toLocaleLowerCase("tr"),
      );
      if (existing) cid = existing.id;
      else {
        const created = await run(() =>
          api.createContact({
            kind: "tuzel",
            undated: false,
            threshold: 0,
            tax_no: "",
            name: "",
            company: name,
            address: "",
            phone: "",
            email: "",
            note: "Banka",
          }),
        );
        if (!created) {
          setSaving(false);
          return;
        }
        cid = created.id;
      }
    }
    const input: EntryInput = {
      contact_id: cid!,
      direction: isLoan ? "verecek" : direction,
      amount: amount!,
      date,
      description,
      status,
      paid_date:
        status === "odendi"
          ? paidDate || todayISO()
          : status === "karsiliksiz"
            ? (editing?.paid_date ?? null)
            : null,
      is_cheque: isCheque,
      cheque_no: chequeNo,
      bank,
      is_loan: isLoan,
      // Kısmi ödeme yalnızca kayıt ödenmemiş kalmaya devam ediyorsa korunur
      paid_amount:
        status === "odenmedi" && editing?.status === "odenmedi"
          ? editing.paid_amount
          : 0,
    };
    const ok = await run<unknown>(
      () =>
        editing ? api.updateEntry(editing.id, input) : api.createEntry(input),
      editing ? "Kayıt güncellendi" : "Kayıt eklendi",
    );
    if (ok !== undefined) {
      // Seçilen eski çekleri bu kaydın tarihinde alınmış / ödenmiş yap
      for (const id of collect) {
        if (!openCheques.some((c) => c.id === id)) continue;
        await run(() => api.setEntryStatus(id, "karsiliksiz", date));
      }
    }
    setSaving(false);
    if (ok !== undefined) {
      bump();
      onClose();
    }
  };

  const remove = async () => {
    if (!editing) return;
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
      (await run(() => api.deleteEntry(editing.id), "Kayıt silindi")) !==
      undefined
    ) {
      bump();
      onClose();
    }
  };

  const txt = statusText(direction, isCheque);
  const accent = direction === "alacak" ? "text-green" : "text-red";

  return (
    <form
      className="flex flex-col min-h-0"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <SheetHeader
        title={editing ? "Kaydı Düzenle" : "Yeni Kayıt"}
        onCancel={onClose}
        action={
          <Button variant="plain" type="submit" disabled={!valid || saving}>
            Kaydet
          </Button>
        }
      />
      <div className="overflow-y-auto px-4 pt-4 pb-2">
        {!isLoan && (
          <Segmented
            className="mb-4"
            value={direction}
            onChange={setDirection}
            options={[
              {
                value: "alacak",
                label: "Alacak · bana verecek",
                activeClass: "text-green font-semibold",
              },
              {
                value: "verecek",
                label: "Verecek · ben vereceğim",
                activeClass: "text-red font-semibold",
              },
            ]}
          />
        )}

        {/* Tutar */}
        <div className="mb-6 rounded-[12px] bg-card shadow-card px-4 py-4 text-center">
          <div className="text-[12px] text-label2 mb-1">Tutar</div>
          <AmountInput
            value={amountText}
            onChange={setAmountText}
            autoFocus={!editing}
            startOpen={!editing}
            amount={amount}
            className={accent}
          />
        </div>

        {/* Kişi */}
        {isLoan ? (
          <Group
            title="Banka"
            footer="Banka, Kişiler'de firma olarak otomatik oluşturulur."
          >
            <BankSelect value={bank} onChange={setBank} />
          </Group>
        ) : (
          <Group title="Kişi / Firma">
            <Row onClick={() => setPicking((p) => !p)}>
              <span className="flex-1 truncate">
                {selected ? (
                  <>
                    <span className="font-medium">{contactName(selected)}</span>
                    {selected.name && selected.company && (
                      <span className="text-label2"> · {selected.company}</span>
                    )}
                  </>
                ) : (
                  <span className="text-label3">Kişi seçin</span>
                )}
              </span>
              <motion.span
                animate={{ rotate: picking ? 90 : 0 }}
                transition={spring}
                className="text-label3"
              >
                <ChevronRight size={16} />
              </motion.span>
            </Row>
            <AnimatePresence initial={false}>
              {picking && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={spring}
                  className="overflow-hidden"
                >
                  <ContactPicker
                    contacts={contacts}
                    selectedId={contactId}
                    onPick={(id) => {
                      setContactId(id);
                      setPicking(false);
                    }}
                    onCreated={(c) => {
                      setContacts((list) =>
                        [...list, c].sort((a, b) =>
                          contactName(a).localeCompare(contactName(b), "tr"),
                        ),
                      );
                      setContactId(c.id);
                      setPicking(false);
                      bump();
                    }}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </Group>
        )}

        <Segmented
          className="mb-4"
          value={isLoan ? "kredi" : isCheque ? "cek" : "normal"}
          onChange={(v) => {
            setIsCheque(v === "cek");
            setIsLoan(v === "kredi");
            if (v === "kredi") setDirection("verecek");
            if (v !== "cek" && status === "karsiliksiz") setStatus("odenmedi");
          }}
          options={[
            { value: "normal", label: "Normal" },
            {
              value: "cek",
              label: "Çek / ileri tarihli",
              activeClass: "text-orange font-semibold",
            },
            {
              value: "kredi",
              label: "Kredi ödemesi",
              activeClass: "text-blue font-semibold",
            },
          ]}
        />

        <Group>
          <DateField
            label={
              isCheque
                ? "Vade tarihi"
                : isLoan
                  ? "Ödeme tarihi (taksit)"
                  : "Tarih"
            }
            value={date}
            onChange={setDate}
          />
          {isCheque && (
            <>
              <FieldRow label="Çek no">
                <input
                  className={inputClass}
                  value={chequeNo}
                  onChange={(e) => setChequeNo(e.target.value)}
                  placeholder="Ör. 0012345"
                />
              </FieldRow>
              <FieldRow label="Banka">
                <input
                  className={inputClass}
                  value={bank}
                  onChange={(e) => setBank(e.target.value)}
                  placeholder="Ör. Ziraat Bankası"
                />
              </FieldRow>
            </>
          )}
          <FieldRow label="Açıklama">
            <input
              className={inputClass}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={isLoan ? "Ör. Taksit 3/12" : "Ör. Fatura #123"}
            />
          </FieldRow>
        </Group>

        {openCheques.length > 0 && (
          <Group
            title="Alınmamış çekler"
            footer="İşaretlediğiniz çekler, bu kaydın tarihinde alınmış (ya da ödenmiş) sayılır. Tutar o kayıtta toplandığı için çek ayrıca toplamlara eklenmez."
          >
            {openCheques.map((c) => {
              const t = statusText(c.direction, true);
              const on = collect.has(c.id);
              return (
                <Row key={c.id} onClick={() => toggleCheque(c.id)}>
                  <span
                    className={cx(
                      "w-[22px] h-[22px] shrink-0 rounded-full border-2 flex items-center justify-center transition-colors",
                      on ? "bg-green border-green text-white" : "border-label3",
                    )}
                  >
                    {on && <CheckIcon size={13} />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block truncate">
                      Çek {c.cheque_no && `No ${c.cheque_no} · `}vade{" "}
                      {formatDateShort(c.date)}
                      {c.status === "karsiliksiz" && (
                        <span className="text-red"> · {t.failed}</span>
                      )}
                    </span>
                    <span className="block text-[12px] text-label2">
                      {formatTL(c.amount)}
                    </span>
                  </span>
                  <span
                    className={cx(
                      "text-[13px] font-medium",
                      on ? "text-green" : "text-label2",
                    )}
                  >
                    {t.doneAction}
                  </span>
                </Row>
              );
            })}
          </Group>
        )}

        <Group title="Durum">
          <div className="p-2">
            <Segmented
              value={status}
              onChange={setStatus}
              options={[
                {
                  value: "odenmedi",
                  label: txt.pending,
                  activeClass: "text-orange font-semibold",
                },
                {
                  value: "odendi",
                  label: txt.done,
                  activeClass: "text-green font-semibold",
                },
                ...(isCheque
                  ? [
                      {
                        value: "karsiliksiz" as Status,
                        label: txt.failed,
                        activeClass: "text-red font-semibold",
                      },
                    ]
                  : []),
              ]}
            />
          </div>
          <AnimatePresence initial={false}>
            {status === "odendi" && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={spring}
                className="overflow-hidden"
              >
                <DateField
                  label="Ödeme tarihi"
                  value={paidDate}
                  onChange={setPaidDate}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </Group>

        {editing && (
          <Group>
            <button
              type="button"
              onClick={remove}
              className="w-full h-11 text-red hover:bg-red/10 transition-colors"
            >
              Kaydı Sil
            </button>
          </Group>
        )}
      </div>
    </form>
  );
}

function ContactPicker({
  contacts,
  selectedId,
  onPick,
  onCreated,
}: {
  contacts: ContactWithBalance[];
  selectedId: number | null;
  onPick: (id: number) => void;
  onCreated: (c: ContactWithBalance) => void;
}) {
  const run = useRunner();
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [kind, setKind] = useState<"gercek" | "tuzel">("gercek");
  const [taxNo, setTaxNo] = useState("");

  const filtered = useMemo(() => {
    const s = trLower(q.trim());
    if (!s) return contacts;
    return contacts.filter((c) =>
      trLower(`${c.name} ${c.company} ${c.phone}`).includes(s),
    );
  }, [contacts, q]);

  const tuzel = kind === "tuzel";
  const taxLen = tuzel ? 10 : 11;
  const taxDigits = taxNo.replace(/\s/g, "");
  const taxBad =
    taxDigits !== "" &&
    (!/^\d+$/.test(taxDigits) || taxDigits.length !== taxLen);
  const canCreate =
    (tuzel ? company.trim() !== "" : name.trim() !== "") && !taxBad;

  const switchKind = (k: "gercek" | "tuzel") => {
    // Yazılan ismi yeni türün asıl alanına taşı
    if (k === "tuzel" && !company.trim() && name.trim()) {
      setCompany(name);
      setName("");
    } else if (k === "gercek" && !name.trim() && company.trim()) {
      setName(company);
      setCompany("");
    }
    setKind(k);
    setTaxNo("");
  };

  const create = async () => {
    if (!canCreate) return;
    const c = await run(
      () =>
        api.createContact({
          kind,
          undated: false,
          threshold: 0,
          tax_no: taxDigits,
          name,
          company,
          address: "",
          phone: "",
          email: "",
          note: "",
        }),
      "Kişi eklendi",
    );
    if (c)
      onCreated({ ...c, open_receivable: 0, open_payable: 0, entry_count: 0 });
  };

  const enter = (e: React.KeyboardEvent) =>
    e.key === "Enter" && (e.preventDefault(), create());

  if (creating) {
    return (
      <div className="border-t border-sep bg-fill/40">
        <div className="p-2">
          <Segmented
            value={kind}
            onChange={switchKind}
            options={[
              { value: "gercek", label: "Gerçek kişi" },
              { value: "tuzel", label: "Tüzel kişi" },
            ]}
          />
        </div>
        {tuzel ? (
          <>
            <FieldRow label="Firma Unvanı">
              <input
                autoFocus
                className={inputClass}
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                onKeyDown={enter}
              />
            </FieldRow>
            <FieldRow label="Yetkili">
              <input
                className={inputClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={enter}
                placeholder="İsteğe bağlı"
              />
            </FieldRow>
            <FieldRow label="VKN">
              <input
                className={inputClass}
                value={taxNo}
                onChange={(e) => setTaxNo(e.target.value)}
                onKeyDown={enter}
                inputMode="numeric"
                maxLength={10}
                placeholder="10 hane, isteğe bağlı"
              />
            </FieldRow>
          </>
        ) : (
          <>
            <FieldRow label="Ad Soyad">
              <input
                autoFocus
                className={inputClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={enter}
              />
            </FieldRow>
            <FieldRow label="Firma">
              <input
                className={inputClass}
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                onKeyDown={enter}
                placeholder="İsteğe bağlı"
              />
            </FieldRow>
            <FieldRow label="T.C. No">
              <input
                className={inputClass}
                value={taxNo}
                onChange={(e) => setTaxNo(e.target.value)}
                onKeyDown={enter}
                inputMode="numeric"
                maxLength={11}
                placeholder="11 hane, isteğe bağlı"
              />
            </FieldRow>
          </>
        )}
        {taxBad && (
          <div className="px-4 pb-1 text-[12px] text-red">
            {tuzel ? "Vergi" : "T.C. kimlik"} numarası {taxLen} haneli rakam
            olmalıdır.
          </div>
        )}
        <div className="flex justify-end gap-2 px-3 pb-3">
          <Button
            type="button"
            variant="plain"
            onClick={() => setCreating(false)}
          >
            Vazgeç
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={create}
            disabled={!canCreate}
          >
            Kişiyi Ekle
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-sep">
      <div className="flex items-center gap-2 mx-3 my-2 px-2.5 h-8 rounded-[9px] bg-fill text-label2">
        <SearchIcon size={15} />
        <input
          autoFocus
          className="flex-1 bg-transparent outline-none text-label placeholder:text-label3"
          placeholder="Ara"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (filtered.length === 1) onPick(filtered[0].id);
            }
          }}
        />
      </div>
      <div className="max-h-52 overflow-y-auto">
        {filtered.map((c) => (
          <button
            type="button"
            key={c.id}
            onClick={() => onPick(c.id)}
            className="w-full flex items-center gap-2 px-4 h-10 text-left hover:bg-fill/60 transition-colors"
          >
            <span className="flex-1 truncate">
              {contactName(c)}
              {c.name && c.company && (
                <span className="text-label2"> · {c.company}</span>
              )}
            </span>
            {c.id === selectedId && (
              <CheckIcon size={16} className="text-blue" />
            )}
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="px-4 py-2 text-label2 text-[13px]">
            Eşleşen kişi yok.
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => {
          setName(q.trim());
          setCreating(true);
        }}
        className="w-full flex items-center gap-2 px-4 h-11 text-blue border-t border-sep hover:bg-fill/60 transition-colors"
      >
        <PlusIcon size={16} />
        {q.trim() ? `Yeni kişi ekle: “${q.trim()}”` : "Yeni kişi ekle"}
      </button>
    </div>
  );
}

/**
 * Lira ve kuruş ayrı kutucuklarda girilir (virgülle uğraşmak gerekmez). Değer "1250,50" biçiminde tutulur.
 * Kutucuklardan çıkılınca toplam meblağ büyük yazıyla gösterilir; meblağa tıklayınca kutucuklar geri gelir.
 */
export function AmountInput({
  value,
  onChange,
  autoFocus,
  startOpen,
  amount,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  autoFocus: boolean;
  startOpen: boolean;
  /** Girilen değerin kuruş karşılığı; geçersizse null */
  amount: number | null;
  className?: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const liraRef = useRef<HTMLInputElement>(null);
  const kurusRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(startOpen);
  const [lira = "", kurus = ""] = value.split(",");
  const join = (l: string, k: string) => (k !== "" ? `${l || "0"},${k}` : l);
  const grouped = lira.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const hasAmount = amount !== null && amount > 0;

  // Odak kutucuklardan dışarı çıkınca (ve geçerli bir tutar varsa) toplam görünümüne geç
  const onBlurBox = (e: React.FocusEvent) => {
    if (e.relatedTarget && boxRef.current?.contains(e.relatedTarget as Node))
      return;
    if (hasAmount) setOpen(false);
  };

  // Tutar dışarıdan değişirse (ör. çek seçimi) ve odak kutucuklarda değilse toplam görünümüne geç
  useEffect(() => {
    if (hasAmount && !boxRef.current?.contains(document.activeElement))
      setOpen(false);
  }, [value, hasAmount]);

  const boxCls =
    "h-10 rounded-[10px] bg-fill px-2.5 outline-none text-[20px] font-semibold tabular placeholder:text-label3 focus:ring-2 focus:ring-blue/60";

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setTimeout(() => liraRef.current?.focus(), 0);
        }}
        title="Tutarı düzenlemek için tıklayın"
        className={cx(
          "mx-auto block rounded-[12px] px-4 py-1 hover:bg-fill/60 transition-colors text-[34px] font-semibold tabular",
          className,
        )}
      >
        {hasAmount ? formatTL(amount!) : "Tutar girin"}
      </button>
    );
  }

  return (
    <div
      ref={boxRef}
      onBlur={onBlurBox}
      className="flex items-end justify-center gap-2"
    >
      <label className="flex flex-col items-center gap-1">
        <span className="text-[11px] text-label2">Lira</span>
        <input
          ref={liraRef}
          autoFocus={autoFocus}
          value={grouped}
          inputMode="numeric"
          placeholder="0"
          aria-label="Lira"
          onChange={(e) =>
            onChange(join(e.target.value.replace(/\D/g, ""), kurus))
          }
          onKeyDown={(e) => {
            // Sağ ok (imleç sondayken), Enter ya da virgül → kuruş kutusuna geç
            const t = e.currentTarget;
            const atEnd =
              t.selectionStart === t.value.length &&
              t.selectionEnd === t.value.length;
            if (
              e.key === "," ||
              e.key === "Enter" ||
              (e.key === "ArrowRight" && atEnd)
            ) {
              e.preventDefault();
              kurusRef.current?.focus();
              kurusRef.current?.select();
            }
          }}
          className={cx(boxCls, "w-32 text-right", className)}
        />
      </label>
      <span className={cx("pb-1.5 text-[22px] font-semibold", className)}>
        ,
      </span>
      <label className="flex flex-col items-center gap-1">
        <span className="text-[11px] text-label2">Kuruş</span>
        <input
          ref={kurusRef}
          value={kurus}
          inputMode="numeric"
          placeholder="00"
          maxLength={2}
          aria-label="Kuruş"
          onChange={(e) =>
            onChange(join(lira, e.target.value.replace(/\D/g, "").slice(0, 2)))
          }
          onBlur={() => kurus.length === 1 && onChange(join(lira, `${kurus}0`))}
          onKeyDown={(e) => {
            const t = e.currentTarget;
            if (
              (e.key === "ArrowLeft" &&
                t.selectionStart === 0 &&
                t.selectionEnd === 0) ||
              (e.key === "Backspace" && kurus === "")
            ) {
              e.preventDefault();
              liraRef.current?.focus();
            }
          }}
          className={cx(boxCls, "w-14 text-center", className)}
        />
      </label>
      <span className={cx("pb-1.5 text-[20px] font-semibold", className)}>
        ₺
      </span>
    </div>
  );
}

/** Bankalar listesinden seçim: iOS tarzı, satıra dokununca açılan aranabilir liste. Listede yoksa "Diğer" ile elle yazılır. */
function BankSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const known = (BANKS as readonly string[]).includes(value);
  const [open, setOpen] = useState(value === "");
  const [other, setOther] = useState(value !== "" && !known);
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const s = trLower(q.trim());
    return s ? BANKS.filter((b) => trLower(b).includes(s)) : BANKS;
  }, [q]);

  return (
    <>
      <Row onClick={() => setOpen((o) => !o)}>
        <span className="flex-1 truncate">
          {value ? (
            <span className="font-medium">{value}</span>
          ) : (
            <span className="text-label3">Banka seçin</span>
          )}
        </span>
        <motion.span
          animate={{ rotate: open ? 90 : 0 }}
          transition={spring}
          className="text-label3"
        >
          <ChevronRight size={16} />
        </motion.span>
      </Row>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={spring}
            className="overflow-hidden"
          >
            <div className="border-t border-sep">
              <div className="flex items-center gap-2 mx-3 my-2 px-2.5 h-8 rounded-[9px] bg-fill text-label2">
                <SearchIcon size={15} />
                <input
                  className="flex-1 bg-transparent outline-none text-label placeholder:text-label3"
                  placeholder="Ara"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (list.length >= 1) {
                        onChange(list[0]);
                        setOther(false);
                        setOpen(false);
                      }
                    }
                  }}
                />
              </div>
              <div className="max-h-56 overflow-y-auto">
                {list.map((b) => (
                  <button
                    type="button"
                    key={b}
                    onClick={() => {
                      onChange(b);
                      setOther(false);
                      setOpen(false);
                      setQ("");
                    }}
                    className="w-full flex items-center gap-2 px-4 h-10 text-left hover:bg-fill/60 active:bg-fill transition-colors border-t border-sep first:border-t-0"
                  >
                    <span className="flex-1 truncate">{b}</span>
                    {b === value && (
                      <CheckIcon size={16} className="text-blue" />
                    )}
                  </button>
                ))}
                {list.length === 0 && (
                  <div className="px-4 py-2 text-label2 text-[13px]">
                    Eşleşen banka yok.
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setOther(true);
                  setOpen(false);
                  if (known) onChange("");
                }}
                className="w-full flex items-center gap-2 px-4 h-11 text-blue border-t border-sep hover:bg-fill/60 transition-colors"
              >
                <PlusIcon size={16} />
                Diğer (elle yaz)
                {other && <CheckIcon size={16} className="ml-auto" />}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {other && !open && (
        <FieldRow label="Banka adı">
          <input
            autoFocus
            className={inputClass}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Banka adı"
          />
        </FieldRow>
      )}
    </>
  );
}
