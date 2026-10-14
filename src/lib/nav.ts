import type { View } from "../components/Dock";

/** Başka bir ekrandan (ör. takvimdeki uyarıdan) bir ekrana, isteğe bağlı olarak bir kişiye geçiş */
let pendingContact: number | null = null;

export function navigate(view: View, contactId?: number) {
  pendingContact = contactId ?? null;
  window.dispatchEvent(
    new CustomEvent<View>("muhasebe:navigate", { detail: view }),
  );
}

/** Kişiler ekranı açılırken seçilecek kişi (StrictMode çift çağrısına dayanıklı: okuma temizlemez) */
export function peekPendingContact(): number | null {
  return pendingContact;
}

export function clearPendingContact() {
  pendingContact = null;
}
