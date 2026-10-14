import { AnimatePresence, motion } from "framer-motion";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { trLower } from "../components/EntryForm";
import { EntryRow } from "../components/EntryRow";
import {
  BuildingIcon,
  DownloadIcon,
  MailIcon,
  NoteIcon,
  PencilIcon,
  PeopleIcon,
  PhoneIcon,
  PinIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
} from "../components/icons";
import {
  Button,
  Empty,
  IconButton,
  Money,
  Segmented,
  cx,
} from "../components/ui";
import {
  type ContactWithBalance,
  type Entry,
  api,
  contactName,
  thresholdReached,
} from "../lib/api";
import { clearPendingContact, peekPendingContact } from "../lib/nav";
import { formatTL } from "../lib/money";
import { spring } from "../lib/motion";
import { summarize } from "../lib/summary";
import { useApp, useRunner } from "../state";

type Filter = "all" | "receivable" | "payable";

function initials(c: ContactWithBalance) {
  const parts = contactName(c).trim().split(/\s+/);
  return (
    (parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")
  ).toLocaleUpperCase("tr");
}

/** Ödenmemiş kayıtlara göre net bakiye: + bize borçlu, - bizim borcumuz */
const netOf = (c: ContactWithBalance) => c.open_receivable - c.open_payable;

function Avatar({ c, size = 36 }: { c: ContactWithBalance; size?: number }) {
  const net = netOf(c);
  return (
    <span
      className={cx(
        "shrink-0 rounded-full flex items-center justify-center font-semibold text-white",
        net > 0
          ? "bg-gradient-to-b from-green/70 to-green"
          : net < 0
            ? "bg-gradient-to-b from-red/70 to-red"
            : "bg-gradient-to-b from-[#a6a6ab] to-gray",
      )}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials(c) || "?"}
    </span>
  );
}

export function ContactsView() {
  const { version, editContact, exportReport, toast } = useApp();
  const [contacts, setContacts] = useState<ContactWithBalance[]>([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<number | null>(
    peekPendingContact,
  );
  useEffect(() => clearPendingContact(), []);

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
      .catch((e) => toast(String(e), "error"));
  }, [version, toast]);

  const filtered = useMemo(() => {
    const s = trLower(q.trim());
    return contacts.filter((c) => {
      if (filter === "receivable" && c.open_receivable <= 0) return false;
      if (filter === "payable" && c.open_payable <= 0) return false;
      if (!s) return true;
      return trLower(`${c.name} ${c.company} ${c.phone} ${c.email}`).includes(
        s,
      );
    });
  }, [contacts, q, filter]);

  const totals = useMemo(
    () => ({
      receivable: contacts.reduce((a, c) => a + c.open_receivable, 0),
      payable: contacts.reduce((a, c) => a + c.open_payable, 0),
    }),
    [contacts],
  );

  const selected = contacts.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="h-full flex">
      {/* Liste */}
      <div className="w-[340px] shrink-0 flex flex-col border-r border-sep">
        <div className="px-4 pt-3 pb-2">
          <div className="flex items-center justify-between h-10">
            <h1 className="text-[28px] font-bold tracking-tight">Kişiler</h1>
            <div className="flex items-center">
              <IconButton
                label="Cari ekstre indir"
                onClick={() =>
                  exportReport({
                    kind: "statement",
                    contactId: selectedId ?? undefined,
                  })
                }
              >
                <DownloadIcon size={20} />
              </IconButton>
              <IconButton
                label="Yeni kişi"
                onClick={() =>
                  editContact({ onSaved: (c) => setSelectedId(c.id) })
                }
              >
                <PlusIcon size={22} />
              </IconButton>
            </div>
          </div>
          <div className="flex gap-3 text-[12px] text-label2 mt-1 mb-3 tabular">
            <span>
              Alacak:{" "}
              <b className="text-green">{formatTL(totals.receivable)}</b>
            </span>
            <span>
              Borç: <b className="text-red">{formatTL(totals.payable)}</b>
            </span>
          </div>
          <div className="flex items-center gap-2 px-2.5 h-9 rounded-[10px] bg-fill text-label2">
            <SearchIcon size={16} />
            <input
              className="flex-1 bg-transparent outline-none text-label placeholder:text-label3"
              placeholder="Ara"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Segmented
            className="mt-2.5"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "Tümü" },
              { value: "receivable", label: "Bana verecek" },
              { value: "payable", label: "Ben vereceğim" },
            ]}
          />
        </div>
        <div className="flex-1 overflow-y-auto fade-top px-2 pb-28">
          {filtered.length === 0 ? (
            <Empty
              icon={<PeopleIcon size={36} />}
              title={contacts.length === 0 ? "Henüz kişi yok" : "Sonuç yok"}
              text={
                contacts.length === 0
                  ? "Alacak veya borç takibi yapacağınız kişi ve firmaları ekleyin."
                  : undefined
              }
            >
              {contacts.length === 0 && (
                <Button
                  variant="primary"
                  onClick={() =>
                    editContact({ onSaved: (c) => setSelectedId(c.id) })
                  }
                >
                  <PlusIcon size={16} /> Kişi Ekle
                </Button>
              )}
            </Empty>
          ) : (
            filtered.map((c) => {
              const net = netOf(c);
              const active = c.id === selectedId;
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={cx(
                    "relative w-full flex items-center gap-3 px-2.5 py-2 rounded-[12px] text-left transition-colors",
                    !active && "hover:bg-fill/60",
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="contact-sel"
                      transition={spring}
                      className="absolute inset-0 rounded-[12px] bg-blue/12"
                    />
                  )}
                  <span className="relative">
                    <Avatar c={c} />
                  </span>
                  <span className="relative flex-1 min-w-0">
                    <span className="block truncate font-medium">
                      {contactName(c)}
                    </span>
                    {thresholdReached(c) ? (
                      <span className="block truncate text-[12px] font-semibold text-orange">
                        Eşiğe ulaştı · çek bekleniyor
                      </span>
                    ) : (
                      <span className="block truncate text-[12px] text-label2">
                        {c.name && c.company
                          ? c.company
                          : `${c.entry_count} kayıt`}
                        {c.undated && " · vadesiz"}
                      </span>
                    )}
                  </span>
                  <span className="relative text-[13px] font-semibold">
                    {net !== 0 ? (
                      <Money value={net} signed />
                    ) : (
                      <span className="text-label3 font-normal">—</span>
                    )}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Detay */}
      <div className="flex-1 min-w-0 relative">
        <AnimatePresence mode="wait" initial={false}>
          {selected ? (
            <motion.div
              key={selected.id}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={spring}
              className="absolute inset-0"
            >
              <ContactDetail
                contact={selected}
                onDeleted={() => setSelectedId(null)}
              />
            </motion.div>
          ) : (
            <motion.div
              key="none"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full flex items-center justify-center"
            >
              <Empty
                icon={<PeopleIcon size={44} />}
                title="Bir kişi seçin"
                text="Bilgilerini, kayıtlarını ve bakiyesini görmek için listeden bir kişi seçin."
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function ContactDetail({
  contact,
  onDeleted,
}: {
  contact: ContactWithBalance;
  onDeleted: () => void;
}) {
  const {
    version,
    editContact,
    editEntry,
    exportReport,
    addPayment,
    confirm,
    bump,
    toast,
  } = useApp();
  const run = useRunner();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [show, setShow] = useState<"open" | "all">("open");

  useEffect(() => {
    api
      .listContactEntries(contact.id)
      .then(setEntries)
      .catch((e) => toast(String(e), "error"));
  }, [contact.id, version, toast]);

  const net = netOf(contact);
  const all = summarize(entries.map((e) => ({ ...e, undated: false })));
  const visible =
    show === "open" ? entries.filter((e) => e.status === "odenmedi") : entries;

  const remove = async () => {
    const ok = await confirm({
      title: `“${contactName(contact)}” silinsin mi?`,
      message:
        entries.length > 0
          ? `Bu kişiye ait ${entries.length} kayıt da silinecek. Bu işlem geri alınamaz.`
          : "Bu işlem geri alınamaz.",
      confirmText: "Sil",
      destructive: true,
    });
    if (!ok) return;
    if (
      (await run(() => api.deleteContact(contact.id), "Kişi silindi")) !==
      undefined
    ) {
      onDeleted();
      bump();
    }
  };

  return (
    <div className="h-full overflow-y-auto fade-top">
      <div className="max-w-[760px] mx-auto px-8 pt-6 pb-28">
        {/* Başlık */}
        <div className="flex items-center gap-4">
          <Avatar c={contact} size={64} />
          <div className="flex-1 min-w-0">
            <h2 className="text-[26px] font-bold tracking-tight truncate selectable">
              {contactName(contact)}
            </h2>
            <div className="text-label2 truncate selectable">
              {contact.kind === "tuzel" ? "Tüzel kişi" : "Gerçek kişi"}
              {contact.name && contact.company && ` · ${contact.company}`}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="secondary"
              onClick={() =>
                exportReport({ kind: "statement", contactId: contact.id })
              }
            >
              <DownloadIcon size={16} /> Cari ekstre
            </Button>
            <IconButton
              label="Düzenle"
              onClick={() => editContact({ contact })}
            >
              <PencilIcon size={18} />
            </IconButton>
            <IconButton label="Sil" onClick={remove} className="text-red">
              <TrashIcon size={18} />
            </IconButton>
          </div>
        </div>

        {/* Bakiye */}
        <div
          className={cx(
            "mt-6 rounded-[18px] p-5 shadow-card",
            net > 0
              ? "bg-green/12 ring-1 ring-green/30"
              : net < 0
                ? "bg-red/12 ring-1 ring-red/30"
                : "bg-card",
          )}
        >
          <div className="text-[13px] text-label2">
            {net > 0
              ? "Size borçlu (bekleyen)"
              : net < 0
                ? "Sizin borcunuz (bekleyen)"
                : "Açık bakiye yok"}
          </div>
          <div
            className={cx(
              "text-[32px] font-bold tracking-tight tabular",
              net > 0 ? "text-green" : net < 0 ? "text-red" : "text-label",
            )}
          >
            {formatTL(Math.abs(net))}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-4 text-[12px] text-label2 tabular">
            <div>
              Bekleyen alacak
              <div className="text-[14px] font-semibold text-green">
                {formatTL(contact.open_receivable)}
              </div>
            </div>
            <div>
              Bekleyen verecek
              <div className="text-[14px] font-semibold text-red">
                {formatTL(contact.open_payable)}
              </div>
            </div>
            <div>
              Tüm kayıtlar neti
              <div className="text-[14px] font-semibold">
                <Money value={all.net} signed />
              </div>
            </div>
          </div>
        </div>

        {/* Tahsilat eşiği (ödeme zamanı belirsiz müşteriler) */}
        {contact.undated && contact.threshold > 0 && (
          <ThresholdCard contact={contact} />
        )}

        {(contact.open_receivable > 0 || contact.open_payable > 0) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {contact.open_receivable > 0 && (
              <Button
                variant="primary"
                onClick={() =>
                  addPayment({ kind: "contact", contact, direction: "alacak" })
                }
              >
                Tahsilat al
              </Button>
            )}
            {contact.open_payable > 0 && (
              <Button
                variant="secondary"
                onClick={() =>
                  addPayment({ kind: "contact", contact, direction: "verecek" })
                }
              >
                Ödeme yap
              </Button>
            )}
          </div>
        )}

        {/* Bilgiler */}
        {(contact.tax_no ||
          contact.phone ||
          contact.email ||
          contact.address ||
          contact.note ||
          contact.company) && (
          <div className="mt-5 rounded-[14px] bg-card shadow-card divide-y divide-sep overflow-hidden selectable">
            {contact.company && (
              <InfoRow
                icon={<BuildingIcon size={17} />}
                label="Firma"
                value={contact.company}
              />
            )}
            {contact.tax_no && (
              <InfoRow
                icon={<NoteIcon size={17} />}
                label={
                  contact.kind === "tuzel"
                    ? "Vergi kimlik no (VKN)"
                    : "T.C. kimlik no"
                }
                value={contact.tax_no}
              />
            )}
            {contact.phone && (
              <InfoRow
                icon={<PhoneIcon size={17} />}
                label="Telefon"
                value={contact.phone}
              />
            )}
            {contact.email && (
              <InfoRow
                icon={<MailIcon size={17} />}
                label="E-posta"
                value={contact.email}
              />
            )}
            {contact.address && (
              <InfoRow
                icon={<PinIcon size={17} />}
                label="Adres"
                value={contact.address}
              />
            )}
            {contact.note && (
              <InfoRow
                icon={<NoteIcon size={17} />}
                label="Not"
                value={contact.note}
              />
            )}
          </div>
        )}

        {/* Kayıtlar */}
        <div className="mt-7 flex items-center justify-between mb-2.5">
          <h3 className="text-[18px] font-semibold">Kayıtlar</h3>
          <div className="flex items-center gap-2">
            <Segmented
              value={show}
              onChange={setShow}
              options={[
                { value: "open", label: "Bekleyen" },
                { value: "all", label: `Tümü (${entries.length})` },
              ]}
            />
            <Button
              variant="primary"
              onClick={() => editEntry({ contactId: contact.id })}
            >
              <PlusIcon size={16} /> Kayıt
            </Button>
          </div>
        </div>
        {visible.length === 0 ? (
          <div className="rounded-[14px] bg-card shadow-card">
            <Empty
              title={show === "open" ? "Bekleyen kayıt yok" : "Henüz kayıt yok"}
            />
          </div>
        ) : (
          <div className="rounded-[14px] bg-card shadow-card overflow-hidden divide-y divide-sep">
            <AnimatePresence initial={false}>
              {visible.map((e) => (
                <EntryRow key={e.id} entry={e} showDate showContact={false} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}

function ThresholdCard({ contact }: { contact: ContactWithBalance }) {
  const reached = thresholdReached(contact);
  const pct = Math.min(
    100,
    (contact.open_receivable / contact.threshold) * 100,
  );
  return (
    <div
      className={cx(
        "mt-3 rounded-[18px] p-5 shadow-card",
        reached ? "bg-orange/12 ring-1 ring-orange/40" : "bg-card",
      )}
    >
      <div className="flex items-baseline justify-between">
        <div className="text-[13px] text-label2">Tahsilat eşiği</div>
        <div className="text-[13px] font-semibold tabular">
          {formatTL(contact.threshold)}
        </div>
      </div>
      <div className="mt-2 h-2.5 rounded-full bg-fill overflow-hidden">
        <div
          className={cx(
            "h-full rounded-full transition-all",
            reached ? "bg-orange" : "bg-blue",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between text-[12px] text-label2 tabular">
        <span>Birikmiş {formatTL(contact.open_receivable)}</span>
        <span className={reached ? "font-semibold text-orange" : undefined}>
          {reached
            ? "Eşiğe ulaşıldı · çek bekleniyor"
            : `Eşiğe kalan ${formatTL(contact.threshold - contact.open_receivable)}`}
        </span>
      </div>
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex gap-3 px-4 py-2.5">
      <span className="text-blue mt-0.5">{icon}</span>
      <div className="min-w-0">
        <div className="text-[11px] text-label2">{label}</div>
        <div className="whitespace-pre-wrap break-words">{value}</div>
      </div>
    </div>
  );
}
