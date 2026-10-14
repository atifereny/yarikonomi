import { relaunch } from "@tauri-apps/plugin-process";
import { type Update, check } from "@tauri-apps/plugin-updater";

export type { Update };

/** Yeni sürüm varsa döndürür; yoksa null. Ağ yoksa ya da tarayıcıda çalışıyorsa hata fırlatır. */
export function checkForUpdate(): Promise<Update | null> {
  return check({ timeout: 15000 });
}

/** İndirir, kurar ve uygulamayı yeniden başlatır. */
export async function installUpdate(
  update: Update,
  onProgress: (percent: number | null) => void,
) {
  let total = 0;
  let got = 0;
  await update.downloadAndInstall((e) => {
    if (e.event === "Started") total = e.data.contentLength ?? 0;
    else if (e.event === "Progress") {
      got += e.data.chunkLength;
      onProgress(total ? Math.min(100, Math.round((got / total) * 100)) : null);
    }
  });
  await relaunch();
}
