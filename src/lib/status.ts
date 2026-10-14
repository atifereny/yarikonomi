import type { Direction } from "./summary";

/** Durum metinleri: çeklerde "alabildim / alamadım" dili kullanılır. */
export function statusText(direction: Direction, isCheque: boolean) {
  if (!isCheque) {
    return {
      pending: "Ödenmedi",
      done: "Ödendi",
      failed: "",
      doneAction: "Ödendi",
      failAction: "",
    };
  }
  return direction === "alacak"
    ? {
        pending: "Bekliyor",
        done: "Alındı",
        failed: "Alınamadı",
        doneAction: "Aldım",
        failAction: "Alamadım",
      }
    : {
        pending: "Bekliyor",
        done: "Ödendi",
        failed: "Ödenemedi",
        doneAction: "Ödedim",
        failAction: "Ödeyemedim",
      };
}
