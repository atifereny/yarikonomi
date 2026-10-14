import { getCurrentWebview } from "@tauri-apps/api/webview";
import { currentMonitor } from "@tauri-apps/api/window";
import { useEffect, useSyncExternalStore } from "react";

export const UI_SCALES = [0.85, 1, 1.15, 1.3, 1.5, 1.75] as const;

/** Ekran sınıfları: fiziksel yüksekliği 1200 px ve altı "1080p", üstü "2K ve üzeri" */
export type Profile = "fhd" | "qhd";

export const PROFILES: { id: Profile; label: string; hint: string }[] = [
  { id: "fhd", label: "1080p ekran", hint: "1920 × 1080" },
  { id: "qhd", label: "2K ekran", hint: "2560 × 1440 ve üzeri" },
];

const LEGACY_KEY = "muhasebe.uiScale";
const keyOf = (p: Profile) => `muhasebe.uiScale.${p}`;
/** Kayıtlı değer yoksa: 1080p'de %100, 2K'da %125 */
export const DEFAULTS: Record<Profile, number> = { fhd: 1, qhd: 1.25 };

const valid = (v: number) => (UI_SCALES as readonly number[]).includes(v);

export function readScale(p: Profile): number {
  try {
    const own = localStorage.getItem(keyOf(p));
    if (own !== null && valid(Number(own))) return Number(own);
    // Eski tek ayar varsa her iki ekran için başlangıç olarak onu kullan
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy !== null && valid(Number(legacy))) return Number(legacy);
  } catch {
    /* yoksay */
  }
  return DEFAULTS[p];
}

export function writeScale(p: Profile, scale: number) {
  try {
    localStorage.setItem(keyOf(p), String(scale));
  } catch {
    /* yoksay */
  }
}

function zoomTo(scale: number) {
  if (!("__TAURI_INTERNALS__" in window)) return;
  // Tarayıcı yakınlaştırması: tüm yazılar ve boşluklar birlikte ölçeklenir, yerleşim yeniden düzenlenir.
  getCurrentWebview()
    .setZoom(scale)
    .catch(() => {});
}

// --- Etkin ekran ---------------------------------------------------------------

export interface ActiveScreen {
  profile: Profile;
  width: number;
  height: number;
}

let active: ActiveScreen = { profile: "fhd", width: 0, height: 0 };
const listeners = new Set<() => void>();

function setActive(next: ActiveScreen) {
  if (
    next.profile === active.profile &&
    next.width === active.width &&
    next.height === active.height
  )
    return;
  active = next;
  listeners.forEach((l) => l());
}

/** Pencerenin bulunduğu monitörün fiziksel boyutu (Windows ölçeklendirmesinden bağımsız) */
async function detectScreen(): Promise<ActiveScreen> {
  let width = 0;
  let height = 0;
  try {
    const m = await currentMonitor();
    if (m) {
      width = m.size.width;
      height = m.size.height;
    }
  } catch {
    /* aşağıdaki tahmine düş */
  }
  if (!height) {
    width = Math.round(window.screen.width * window.devicePixelRatio);
    height = Math.round(window.screen.height * window.devicePixelRatio);
  }
  return { profile: height > 1200 ? "qhd" : "fhd", width, height };
}

/** Ekran sınıfına ait ölçeği uygular */
export function applyProfile(p: Profile) {
  zoomTo(readScale(p));
}

/** Açılışta ve pencere başka monitöre taşınıp yeniden boyutlandığında doğru ekranın ölçeğini uygular */
export function useUiScale() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      const s = await detectScreen();
      const changed = s.profile !== active.profile || active.height === 0;
      setActive(s);
      if (changed) applyProfile(s.profile);
    };
    check();
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(check, 400);
    };
    window.addEventListener("resize", onResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", onResize);
    };
  }, []);
}

export function useActiveScreen(): ActiveScreen {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => active,
  );
}
