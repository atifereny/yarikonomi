import { useMemo, useState } from "react";
import { type ContactWithBalance, contactName } from "../lib/api";
import { CheckIcon, SearchIcon } from "./icons";
import { Button, Group, Row, Sheet, SheetHeader } from "./ui";

/** Takvimi seçilen firma/kişilerle sınırlamak için çoklu seçim penceresi */
export function ContactFilter({
  open,
  contacts,
  selected,
  onChange,
  onClose,
}: {
  open: boolean;
  contacts: ContactWithBalance[];
  selected: Set<number>;
  onChange: (next: Set<number>) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const n = q.trim().toLocaleLowerCase("tr");
    return contacts
      .filter((c) => !n || contactName(c).toLocaleLowerCase("tr").includes(n))
      .sort((a, b) => contactName(a).localeCompare(contactName(b), "tr"));
  }, [contacts, q]);

  const toggle = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };

  return (
    <Sheet open={open} onClose={onClose} width={440}>
      <SheetHeader
        title="Firma / kişi filtresi"
        onCancel={selected.size ? () => onChange(new Set()) : undefined}
        cancelLabel="Temizle"
        action={
          <Button variant="plain" onClick={onClose}>
            Bitti
          </Button>
        }
      />
      <div className="overflow-y-auto p-4">
        <div className="mb-4 flex items-center gap-2 h-10 px-3 rounded-[10px] bg-fill">
          <SearchIcon size={16} className="text-label2" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ara"
            autoFocus
            className="flex-1 bg-transparent outline-none text-[15px]"
          />
        </div>
        <Group
          footer={
            selected.size
              ? `${selected.size} seçili: takvimde yalnızca bunlarla olan hesap görünür.`
              : "Hiçbiri seçili değilse tüm hesap görünür."
          }
        >
          {list.length === 0 && (
            <Row className="text-label2 text-[14px]">Sonuç yok</Row>
          )}
          {list.map((c) => {
            const on = selected.has(c.id);
            return (
              <Row
                key={c.id}
                onClick={() => toggle(c.id)}
                className="cursor-pointer"
              >
                <span className="flex-1 truncate">{contactName(c)}</span>
                {on && <CheckIcon size={18} className="text-blue" />}
              </Row>
            );
          })}
        </Group>
      </div>
    </Sheet>
  );
}
