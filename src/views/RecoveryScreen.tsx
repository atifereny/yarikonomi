import { ask, open } from "@tauri-apps/plugin-dialog";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { type AppInfo, type BackupFile, api, errorText } from "../lib/api";
import { formatDateTime } from "../lib/dates";
import { softSpring } from "../lib/motion";
import { Button, Group, Row } from "../components/ui";
import { formatSize } from "./SettingsView";

/** Veritabanı bulunamadığında veya açılamadığında gösterilir; uygulama çökmez. */
export function RecoveryScreen({ info, onRecovered }: { info: AppInfo; onRecovered: () => void }) {
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listBackups().then(setBackups).catch(() => setBackups([]));
  }, [info.backup_dir]);

  const attempt = async (fn: () => Promise<unknown>, question?: string) => {
    if (question && !(await ask(question, { title: "Yarıkonomi", kind: "warning", okLabel: "Devam", cancelLabel: "Vazgeç" }))) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
      onRecovered();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const pickDb = async () => {
    const path = await open({ title: "Veritabanı yedeği seçin", filters: [{ name: "Veritabanı", extensions: ["db"] }] });
    if (typeof path === "string") attempt(() => api.restoreBackup(path));
  };

  const pickJson = async () => {
    const path = await open({ title: "JSON yedeği seçin", filters: [{ name: "JSON yedeği", extensions: ["json"] }] });
    if (typeof path === "string") attempt(() => api.importJson(path));
  };

  const pickBackupDir = async () => {
    const dir = await open({ directory: true, title: "Yedeklerin bulunduğu klasörü seçin" });
    if (typeof dir !== "string") return;
    try {
      await api.setBackupDir(dir);
      setBackups(await api.listBackups());
    } catch (e) {
      setError(errorText(e));
    }
  };

  const missing = info.status.state === "missing";

  return (
    <div className="h-full overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={softSpring}
        className="max-w-[600px] mx-auto px-6 py-12"
      >
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 rounded-[18px] bg-orange/15 text-orange flex items-center justify-center text-[34px] font-bold mb-4">!</div>
          <h1 className="text-[26px] font-bold tracking-tight">{missing ? "Veritabanı bulunamadı" : "Veritabanı açılamadı"}</h1>
          <p className="mt-2 text-label2 leading-relaxed">
            {missing ? (
              <>
                Veri dosyası beklenen yerde yok:
                <br />
                <span className="selectable text-label text-[13px]">{info.db_path}</span>
                <br />
                Dosya taşınmış, silinmiş ya da bulut senkronizasyonu henüz tamamlanmamış olabilir.
              </>
            ) : (
              <>
                {info.status.state === "error" && <span className="selectable text-label">{info.status.message}</span>}
                <br />
                Aşağıdaki seçeneklerden biriyle verilerinizi geri yükleyebilirsiniz.
              </>
            )}
          </p>
        </div>

        {error && <div className="mb-5 rounded-[12px] bg-red/12 text-red px-4 py-3 text-[13px] selectable">{error}</div>}

        <Group title="Otomatik yedekler" footer={`Klasör: ${info.backup_dir}`}>
          {backups.length === 0 && (
            <Row>
              <span className="text-label2 flex-1">Bu klasörde yedek bulunamadı.</span>
              <Button variant="plain" onClick={pickBackupDir}>
                Klasör Seç…
              </Button>
            </Row>
          )}
          {backups.slice(0, 8).map((b, i) => (
            <Row key={b.path}>
              <div className="flex-1 min-w-0">
                <div className="tabular font-medium">
                  {formatDateTime(b.created)} {i === 0 && <span className="text-[11px] text-green ml-1">EN YENİ</span>}
                </div>
                <div className="text-[12px] text-label2 truncate">
                  {b.name} · {formatSize(b.size)}
                </div>
              </div>
              <Button variant={i === 0 ? "primary" : "plain"} disabled={busy} onClick={() => attempt(() => api.restoreBackup(b.path))}>
                Geri Yükle
              </Button>
            </Row>
          ))}
        </Group>

        <Group title="Diğer seçenekler">
          <Row onClick={busy ? undefined : pickDb}>
            <span className="flex-1 text-blue">Başka bir .db dosyası seç…</span>
          </Row>
          <Row onClick={busy ? undefined : pickJson}>
            <span className="flex-1 text-blue">JSON yedeğinden içe aktar…</span>
          </Row>
          <Row onClick={busy ? undefined : () => attempt(() => api.retryOpen())}>
            <span className="flex-1 text-blue">Tekrar dene</span>
          </Row>
          <Row
            onClick={
              busy
                ? undefined
                : () =>
                    attempt(
                      () => api.createFreshDb(),
                      "Boş bir veritabanı oluşturulacak. Mevcut (bozuk) dosya silinmez, yeniden adlandırılır. Devam edilsin mi?",
                    )
            }
          >
            <span className="flex-1 text-red">Boş veritabanıyla başla</span>
          </Row>
        </Group>
      </motion.div>
    </div>
  );
}
