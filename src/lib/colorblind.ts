import { useEffect } from "react";

const KEY = "muhasebe.colorblind";

export function readColorblind(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** html.cb sınıfı: yeşil/kırmızı yerine mavi/turuncu paleti ve renge bağlı olmayan işaretler (çizgili gün, kare nokta) */
export function applyColorblind(on: boolean) {
  document.documentElement.classList.toggle("cb", on);
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    /* yoksay */
  }
}

export function useColorblind() {
  useEffect(() => {
    applyColorblind(readColorblind());
  }, []);
}
