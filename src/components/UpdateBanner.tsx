import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { errorText } from "../lib/api";
import { softSpring } from "../lib/motion";
import { type Update, checkForUpdate, installUpdate } from "../lib/updater";
import { Button } from "./ui";

/** Uygulama açılışında bir kez güncelleme denetler; yeni sürüm varsa köşede küçük bir kart gösterir. */
export function UpdateBanner() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [busy, setBusy] = useState(false);
  const [percent, setPercent] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    // Açılıştaki denetim sessizdir: ağ yoksa ya da depo erişilemezse kullanıcıya hata gösterilmez
    checkForUpdate()
      .then((u) => alive && setUpdate(u))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const install = async () => {
    if (!update) return;
    setBusy(true);
    setError(null);
    try {
      await installUpdate(update, setPercent);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {update && (
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={softSpring}
          className="fixed top-4 right-4 z-50 w-[320px] rounded-[16px] bg-card shadow-pop border border-sep p-4"
          role="status"
        >
          <div className="font-semibold text-[15px]">
            Yeni sürüm var · {update.version}
          </div>
          <div className="mt-0.5 text-[13px] text-label2">
            Şu anki sürüm {update.currentVersion}. Güncelleme sonrası uygulama
            yeniden başlar; verileriniz değişmez.
          </div>
          {error && <div className="mt-2 text-[12px] text-red">{error}</div>}
          <div className="mt-3 flex justify-end gap-1">
            <Button
              variant="plain"
              disabled={busy}
              onClick={() => setUpdate(null)}
            >
              Sonra
            </Button>
            <Button variant="primary" disabled={busy} onClick={install}>
              {busy
                ? percent === null
                  ? "İndiriliyor…"
                  : `İndiriliyor %${percent}`
                : "Şimdi güncelle"}
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
