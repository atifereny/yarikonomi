import { useRef, useState } from "react";
import { type ContactInput, api } from "../lib/api";
import { kurusToInput, parseTL } from "../lib/money";
import { type ContactEditorRequest, useApp, useRunner } from "../state";
import {
  Button,
  FieldRow,
  Group,
  Segmented,
  Sheet,
  SheetHeader,
  inputClass,
} from "./ui";

const EMPTY: ContactInput = {
  kind: "gercek",
  undated: false,
  threshold: 0,
  tax_no: "",
  name: "",
  company: "",
  address: "",
  phone: "",
  email: "",
  note: "",
};

export function ContactForm({
  request,
  onClose,
}: {
  request: ContactEditorRequest | null;
  onClose: () => void;
}) {
  // Kapanış animasyonu sırasında içerik kaybolmasın diye son isteği tut
  const last = useRef<ContactEditorRequest | null>(null);
  const openCount = useRef(0);
  if (request && request !== last.current) {
    last.current = request;
    openCount.current++;
  }
  const r = request ?? last.current;
  return (
    <Sheet open={!!request} onClose={onClose} width={480}>
      {r && (
        <ContactFormBody
          key={openCount.current}
          request={r}
          onClose={onClose}
        />
      )}
    </Sheet>
  );
}

function ContactFormBody({
  request,
  onClose,
}: {
  request: ContactEditorRequest;
  onClose: () => void;
}) {
  const { bump } = useApp();
  const run = useRunner();
  const editing = request.contact;
  const [form, setForm] = useState<ContactInput>(() =>
    editing
      ? {
          kind: editing.kind,
          tax_no: editing.tax_no,
          undated: editing.undated,
          threshold: editing.threshold,
          name: editing.name,
          company: editing.company,
          address: editing.address,
          phone: editing.phone,
          email: editing.email,
          note: editing.note,
        }
      : EMPTY,
  );
  const [saving, setSaving] = useState(false);
  const [thresholdText, setThresholdText] = useState(
    editing && editing.threshold > 0 ? kurusToInput(editing.threshold) : "",
  );
  const thresholdKurus =
    thresholdText.trim() === "" ? 0 : parseTL(thresholdText);
  const set = (k: keyof ContactInput) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const tuzel = form.kind === "tuzel";
  const taxLen = tuzel ? 10 : 11;
  const taxDigits = form.tax_no.replace(/\s/g, "");
  const taxBad =
    taxDigits !== "" &&
    (!/^\d+$/.test(taxDigits) || taxDigits.length !== taxLen);
  const valid =
    (tuzel ? form.company.trim() !== "" : form.name.trim() !== "") &&
    !taxBad &&
    thresholdKurus !== null;

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    const payload: ContactInput = {
      ...form,
      threshold: form.undated ? (thresholdKurus ?? 0) : 0,
    };
    const saved = await run(
      async () => {
        if (editing) {
          await api.updateContact(editing.id, payload);
          return { ...editing, ...payload };
        }
        return api.createContact(payload);
      },
      editing ? "Kişi güncellendi" : "Kişi eklendi",
    );
    setSaving(false);
    if (saved) {
      bump();
      request.onSaved?.(saved);
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
        title={editing ? "Kişiyi Düzenle" : "Yeni Kişi"}
        onCancel={onClose}
        action={
          <Button variant="plain" type="submit" disabled={!valid || saving}>
            {editing ? "Kaydet" : "Ekle"}
          </Button>
        }
      />
      <div className="overflow-y-auto px-4 pt-5">
        <Segmented
          className="mb-5"
          value={form.kind}
          onChange={(kind) => setForm((f) => ({ ...f, kind, tax_no: "" }))}
          options={[
            { value: "gercek", label: "Gerçek kişi" },
            { value: "tuzel", label: "Tüzel kişi" },
          ]}
        />
        <Group
          footer={
            taxBad
              ? `${tuzel ? "Vergi" : "T.C. kimlik"} numarası ${taxLen} haneli rakam olmalıdır.`
              : undefined
          }
        >
          {tuzel ? (
            <>
              <FieldRow label="Firma Unvanı">
                <input
                  autoFocus
                  className={inputClass}
                  value={form.company}
                  onChange={set("company")}
                  placeholder="Ör. Yılmaz Ltd. Şti."
                />
              </FieldRow>
              <FieldRow label="Yetkili">
                <input
                  className={inputClass}
                  value={form.name}
                  onChange={set("name")}
                  placeholder="İsteğe bağlı"
                />
              </FieldRow>
              <FieldRow label="VKN">
                <input
                  className={inputClass}
                  value={form.tax_no}
                  onChange={set("tax_no")}
                  placeholder="Vergi kimlik no (10 hane)"
                  inputMode="numeric"
                  maxLength={10}
                />
              </FieldRow>
            </>
          ) : (
            <>
              <FieldRow label="Ad Soyad">
                <input
                  autoFocus
                  className={inputClass}
                  value={form.name}
                  onChange={set("name")}
                  placeholder="Ör. Ayşe Yılmaz"
                />
              </FieldRow>
              <FieldRow label="Firma">
                <input
                  className={inputClass}
                  value={form.company}
                  onChange={set("company")}
                  placeholder="İsteğe bağlı"
                />
              </FieldRow>
              <FieldRow label="T.C. No">
                <input
                  className={inputClass}
                  value={form.tax_no}
                  onChange={set("tax_no")}
                  placeholder="T.C. kimlik no (11 hane)"
                  inputMode="numeric"
                  maxLength={11}
                />
              </FieldRow>
            </>
          )}
        </Group>
        <Group>
          <FieldRow label="Telefon">
            <input
              className={inputClass}
              value={form.phone}
              onChange={set("phone")}
              placeholder="0 5xx xxx xx xx"
              inputMode="tel"
            />
          </FieldRow>
          <FieldRow label="E-posta">
            <input
              className={inputClass}
              value={form.email}
              onChange={set("email")}
              placeholder="ornek@eposta.com"
              inputMode="email"
            />
          </FieldRow>
          <FieldRow label="Adres">
            <textarea
              className={`${inputClass} resize-none`}
              rows={2}
              value={form.address}
              onChange={set("address")}
              placeholder="Adres"
            />
          </FieldRow>
        </Group>
        <Group
          footer={
            form.undated
              ? "Bu kişinin ödenmemiş kayıtları takvimdeki aylık toplamlara girmez, “vadesiz” olarak ayrı gösterilir. Eşik doluysa uyarı alırsınız; çek geldiğinde “Tahsilat al” ile en eski faturalardan başlayarak kapatırsınız."
              : "Borcu belli bir tutara ulaşmadan ödeme yapmayan müşteriler için açın."
          }
        >
          <div className="flex items-center gap-3 px-4 min-h-11 py-1.5">
            <span className="flex-1">Ödeme zamanı belirsiz</span>
            <button
              type="button"
              role="switch"
              aria-checked={form.undated}
              onClick={() => setForm((f) => ({ ...f, undated: !f.undated }))}
              className={`relative w-[46px] h-[28px] rounded-full transition-colors ${form.undated ? "bg-green" : "bg-fill2"}`}
            >
              <span
                className="absolute top-[2px] left-[2px] w-6 h-6 rounded-full bg-white shadow transition-transform"
                style={{
                  transform: form.undated ? "translateX(18px)" : "none",
                }}
              />
            </button>
          </div>
          {form.undated && (
            <FieldRow label="Tahsilat eşiği">
              <div className="flex items-center gap-1.5">
                <input
                  className={inputClass}
                  value={thresholdText}
                  onChange={(e) => setThresholdText(e.target.value)}
                  placeholder="Ör. 1.000.000 (isteğe bağlı)"
                  inputMode="decimal"
                />
                <span className="text-label2">₺</span>
              </div>
            </FieldRow>
          )}
        </Group>
        {form.undated && thresholdKurus === null && (
          <p className="px-4 -mt-4 mb-4 text-[12px] text-red">
            Geçerli bir tutar girin.
          </p>
        )}
        <Group>
          <FieldRow label="Not">
            <textarea
              className={`${inputClass} resize-none`}
              rows={3}
              value={form.note}
              onChange={set("note")}
              placeholder="Not"
            />
          </FieldRow>
        </Group>
      </div>
    </form>
  );
}
