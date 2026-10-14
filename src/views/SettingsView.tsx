import { getVersion } from "@tauri-apps/api/app";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useEffect, useState } from "react";
import { applyColorblind, readColorblind } from "../lib/colorblind";
import {
  PROFILES,
  type Profile,
  UI_SCALES,
  applyProfile,
  readScale,
  useActiveScreen,
  writeScale,
} from "../lib/uiScale";
import { FolderIcon } from "../components/icons";
import { Button, Group, Row, Segmented } from "../components/ui";
import { type BackupFile, type Theme, api, errorText } from "../lib/api";
import { checkForUpdate, installUpdate } from "../lib/updater";
import { formatDateTime, todayISO } from "../lib/dates";
import { useApp, useRunner } from "../state";

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toFixed(1).replace(".", ",")} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

export function SettingsView() {
  const { info, refreshInfo, bump, confirm, toast, version } = useApp();
  const [checking, setChecking] = useState(false);
  const [appVersion, setAppVersion] = useState("");
  useEffect(() => {
    getVersion()
      .then(setAppVersion)
      .catch(() => {});
  }, []);

  const checkUpdate = async () => {
    setChecking(true);
    try {
      const u = await checkForUpdate();
      if (!u) toast("Uygulama güncel");
      else if (
        await confirm({
          title: `Yeni sürüm ${u.version}`,
          message:
            "İndirilip kurulsun mu? Uygulama yeniden başlar; verileriniz değişmez.",
          confirmText: "Güncelle",
        })
      ) {
        toast("İndiriliyor…");
        await installUpdate(u, () => {});
      }
    } catch (e) {
      toast(`Güncelleme denetlenemedi: ${errorText(e)}`, "error");
    } finally {
      setChecking(false);
    }
  };
  const run = useRunner();
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [showAll, setShowAll] = useState(false);
  const screen = useActiveScreen();
  const [scales, setScales] = useState<Record<Profile, number>>(() => ({
    fhd: readScale("fhd"),
    qhd: readScale("qhd"),
  }));
  const setScale = (p: Profile, v: number) => {
    setScales((s) => ({ ...s, [p]: v }));
    writeScale(p, v);
    if (p === screen.profile) applyProfile(p); // yalnızca şu an kullandığınız ekranın ölçeği hemen uygulanır
  };
  const [cb, setCb] = useState(readColorblind);

  const loadBackups = () =>
    api
      .listBackups()
      .then(setBackups)
      .catch(() => setBackups([]));
  useEffect(() => {
    loadBackups();
  }, [info.backup_dir, info.last_backup_at, version]);

  const setTheme = async (t: Theme) => {
    await run(() => api.setTheme(t));
    await refreshInfo();
  };

  const chooseBackupDir = async () => {
    const dir = await open({
      directory: true,
      title: "Yedek klasörünü seçin",
      defaultPath: info.backup_dir,
    });
    if (typeof dir !== "string") return;
    await run(() => api.setBackupDir(dir), "Yedek klasörü değiştirildi");
    await refreshInfo();
  };

  const resetBackupDir = async () => {
    await run(
      () => api.setBackupDir(null),
      "Varsayılan yedek klasörüne dönüldü",
    );
    await refreshInfo();
  };

  const backupNow = async () => {
    await run(() => api.backupNow(), "Yedek alındı");
    await refreshInfo();
  };

  const exportJson = async () => {
    const path = await save({
      title: "Yedeği dışa aktar",
      defaultPath: `muhasebe-yedek-${todayISO()}.json`,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!path) return;
    await run(() => api.exportJson(path), "Yedek dışa aktarıldı");
  };

  const importJson = async () => {
    const path = await open({
      title: "Yedekten içe aktar",
      filters: [{ name: "JSON yedeği", extensions: ["json"] }],
    });
    if (typeof path !== "string") return;
    const ok = await confirm({
      title: "Veriler değiştirilsin mi?",
      message:
        "Mevcut tüm kişi ve kayıtlar, seçilen yedektekilerle değiştirilecek. İşlemden önce otomatik yedek alınır.",
      confirmText: "İçe Aktar",
      destructive: true,
    });
    if (!ok) return;
    const r = await run(() => api.importJson(path));
    if (r) {
      bump();
      await refreshInfo();
      await run(
        async () => undefined,
        `${r.contacts} kişi ve ${r.entries} kayıt içe aktarıldı`,
      );
    }
  };

  const restore = async (b: BackupFile) => {
    const ok = await confirm({
      title: "Bu yedeğe dönülsün mü?",
      message: `${formatDateTime(b.created)} tarihli yedek geri yüklenecek. Mevcut veriler önce yedeklenir.`,
      confirmText: "Geri Yükle",
      destructive: true,
    });
    if (!ok) return;
    if (
      (await run(() => api.restoreBackup(b.path), "Yedek geri yüklendi")) !==
      undefined
    ) {
      bump();
      await refreshInfo();
    }
  };

  const restoreFromFile = async () => {
    const path = await open({
      title: "Veritabanı yedeği seçin",
      filters: [{ name: "Veritabanı", extensions: ["db"] }],
    });
    if (typeof path !== "string") return;
    await restore({ name: path, path, size: 0, created: "" });
  };

  const list = showAll ? backups : backups.slice(0, 5);

  return (
    <div className="h-full overflow-y-auto fade-top">
      <div className="max-w-[680px] mx-auto px-6 pt-6 pb-28">
        <h1 className="text-[34px] font-bold tracking-tight mb-6">Ayarlar</h1>

        <Group
          title="Görünüm"
          footer="“Sistem” seçiliyken Windows'un açık/koyu tema ayarı takip edilir."
        >
          <div className="p-2">
            <Segmented
              value={info.theme}
              onChange={setTheme}
              options={[
                { value: "system", label: "Sistem" },
                { value: "light", label: "Açık" },
                { value: "dark", label: "Koyu" },
              ]}
            />
          </div>
        </Group>

        <Group
          title="Renk körlüğü modu"
          footer="Yeşil ve kırmızı yerine mavi ve turuncu kullanılır. Ayrıca verecek noktaları kare olur, eksi günler çizgili görünür; böylece renge bakmadan da ayırt edilir."
        >
          <div className="p-2">
            <Segmented
              value={cb ? "on" : "off"}
              onChange={(v) => {
                setCb(v === "on");
                applyColorblind(v === "on");
              }}
              options={[
                { value: "off", label: "Kapalı" },
                { value: "on", label: "Açık" },
              ]}
            />
          </div>
        </Group>

        <Group
          title="Arayüz boyutu"
          footer={`Her ekran türü için ayrı boyut seçilir; uygulama hangi ekrandaysa onun ayarını kullanır. Şu an algılanan: ${screen.width ? `${screen.width} × ${screen.height}` : "—"}.`}
        >
          {PROFILES.map((pr) => {
            const isActive = screen.profile === pr.id;
            return (
              <div key={pr.id} className="p-2">
                <div className="flex items-baseline justify-between px-2 pb-1.5">
                  <span className="font-medium">
                    {pr.label}{" "}
                    <span className="text-label2 font-normal text-[12px]">
                      {pr.hint}
                    </span>
                  </span>
                  {isActive && (
                    <span className="text-[11px] font-semibold text-blue">
                      ŞU AN BU EKRAN
                    </span>
                  )}
                </div>
                <Segmented
                  value={String(scales[pr.id])}
                  onChange={(v) => setScale(pr.id, Number(v))}
                  options={UI_SCALES.map((sc) => ({
                    value: String(sc),
                    label: `%${Math.round(sc * 100)}`,
                  }))}
                />
              </div>
            );
          })}
        </Group>

        <Group
          title="Veri"
          footer="Tüm veriler bu dosyada tutulur. Uygulama kapalıyken dosyayı başka bir yere taşımayın."
        >
          <Row>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] text-label2">Veritabanı</div>
              <div
                className="truncate selectable text-[13px]"
                title={info.db_path}
              >
                {info.db_path}
              </div>
            </div>
            <Button
              variant="secondary"
              onClick={() => run(() => api.openFolder(info.data_dir))}
            >
              <FolderIcon size={16} /> Klasörü Aç
            </Button>
          </Row>
        </Group>

        <Group
          title="Otomatik Yedekleme"
          footer="Uygulama her açıldığında ve değişikliklerden sonra (en fazla dakikada bir) yedek alınır. Son 30 yedek saklanır. OneDrive veya Google Drive klasörü seçerek yedekleri buluta da gönderebilirsiniz."
        >
          <Row>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] text-label2">
                Yedek klasörü {info.custom_backup_dir ? "" : "(varsayılan)"}
              </div>
              <div
                className="truncate selectable text-[13px]"
                title={info.backup_dir}
              >
                {info.backup_dir}
              </div>
            </div>
            <Button
              variant="secondary"
              onClick={() => run(() => api.openFolder(info.backup_dir))}
            >
              <FolderIcon size={16} />
            </Button>
          </Row>
          <Row>
            <Button variant="plain" className="-ml-3" onClick={chooseBackupDir}>
              Klasörü Değiştir…
            </Button>
            {info.custom_backup_dir && (
              <Button variant="plain" onClick={resetBackupDir}>
                Varsayılana Dön
              </Button>
            )}
          </Row>
          <Row>
            <div className="flex-1 text-[13px]">
              {info.last_backup_error ? (
                <span className="text-red">{info.last_backup_error}</span>
              ) : info.last_backup_at ? (
                <span className="text-label2">
                  Son yedek: {formatDateTime(info.last_backup_at)}
                </span>
              ) : (
                <span className="text-label2">
                  Bu oturumda henüz yedek alınmadı.
                </span>
              )}
            </div>
            <Button variant="secondary" onClick={backupNow}>
              Şimdi Yedekle
            </Button>
          </Row>
        </Group>

        <Group
          title={`Yedekler (${backups.length})`}
          footer="Bir yedeğe dönmeden önce mevcut veriler otomatik olarak yedeklenir."
        >
          {list.length === 0 && (
            <Row>
              <span className="text-label2">Yedek bulunamadı.</span>
            </Row>
          )}
          {list.map((b) => (
            <Row key={b.path}>
              <div className="flex-1 min-w-0">
                <div className="tabular">{formatDateTime(b.created)}</div>
                <div className="text-[12px] text-label2 truncate">
                  {b.name} · {formatSize(b.size)}
                </div>
              </div>
              <Button variant="plain" onClick={() => restore(b)}>
                Geri Yükle
              </Button>
            </Row>
          ))}
          {backups.length > 5 && (
            <Row>
              <Button
                variant="plain"
                className="-ml-3"
                onClick={() => setShowAll((s) => !s)}
              >
                {showAll
                  ? "Daha az göster"
                  : `Tümünü göster (${backups.length})`}
              </Button>
            </Row>
          )}
          <Row>
            <Button variant="plain" className="-ml-3" onClick={restoreFromFile}>
              Başka bir .db dosyasından geri yükle…
            </Button>
          </Row>
        </Group>

        <Group
          title="Dışa / İçe Aktarma"
          footer="JSON yedeği tüm kişi ve kayıtları okunabilir bir dosyada saklar; başka bir bilgisayara taşımak için kullanılabilir."
        >
          <Row onClick={exportJson}>
            <span className="flex-1 text-blue">Yedeği dışa aktar (JSON)</span>
          </Row>
          <Row onClick={importJson}>
            <span className="flex-1 text-blue">Yedekten içe aktar (JSON)</span>
          </Row>
        </Group>

        <Group title="Güncelleme">
          <Row onClick={checking ? undefined : checkUpdate}>
            <span className="flex-1 text-blue">
              {checking ? "Denetleniyor…" : "Güncellemeleri denetle"}
            </span>
            <span className="text-label2 text-[13px]">v{appVersion}</span>
          </Row>
        </Group>

        <p className="text-center text-[12px] text-label3 mt-8">
          Yarıkonomi · Şema v{info.schema_version}
        </p>
      </div>
    </div>
  );
}
