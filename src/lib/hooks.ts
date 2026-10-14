import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/** Sayısal anahtar değiştiğinde kaydırma yönünü (+1 / -1) döndürür. StrictMode'da güvenli. */
export function useSlideDirection(key: number): number {
  const [s, setS] = useState({ key, dir: 1 });
  if (s.key !== key) {
    const next = { key, dir: key > s.key ? 1 : -1 };
    setS(next);
    return next.dir;
  }
  return s.dir;
}

// Üst üste açılan paneller için Esc yığını: yalnızca en üstteki kapanır.
const escStack: { current: () => void }[] = [];
let escListening = false;

function onGlobalKey(e: KeyboardEvent) {
  if (e.key !== "Escape" || escStack.length === 0) return;
  e.preventDefault();
  escStack[escStack.length - 1].current();
}

export function useEscape(active: boolean, handler: () => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!active) return;
    if (!escListening) {
      window.addEventListener("keydown", onGlobalKey);
      escListening = true;
    }
    const item = { current: () => ref.current() };
    escStack.push(item);
    return () => {
      const i = escStack.indexOf(item);
      if (i >= 0) escStack.splice(i, 1);
    };
  }, [active]);
}

// Açık panel (Sheet) sayısı: menü gibi yüzen öğeler panel açıkken gizlenir.
let openSheets = 0;
const sheetListeners = new Set<() => void>();
const emitSheets = () => sheetListeners.forEach((l) => l());

/** Panel açıkken çağrılır; kapanınca ya da bileşen kalkınca sayacı düşürür. */
export function useSheetRegistration(open: boolean) {
  useEffect(() => {
    if (!open) return;
    openSheets++;
    emitSheets();
    return () => {
      openSheets--;
      emitSheets();
    };
  }, [open]);
}

export function useSheetOpen(): boolean {
  return useSyncExternalStore(
    (cb) => {
      sheetListeners.add(cb);
      return () => sheetListeners.delete(cb);
    },
    () => openSheets > 0,
  );
}
