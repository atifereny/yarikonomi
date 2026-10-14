import { useEffect, useState } from "react";
import { type Entry, api } from "../../lib/api";
import { useApp } from "../../state";

/** [from, to] aralığındaki kayıtları yükler; her yazma işleminden sonra yeniler. */
export function useEntries(from: string | null, to: string | null) {
  const { version, toast } = useApp();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!from || !to) return;
    let alive = true;
    api
      .listEntries(from, to)
      .then((list) => {
        if (!alive) return;
        setEntries(list);
        setLoadedKey(`${from}|${to}`);
      })
      .catch((e) => toast(String(e), "error"));
    return () => {
      alive = false;
    };
  }, [from, to, version, toast]);

  // Aralık değiştiyse, yeni veri gelene kadar eski aralığın verisini gösterme
  const fresh = loadedKey === `${from}|${to}`;
  return { entries: fresh ? entries : [], loaded: fresh };
}
