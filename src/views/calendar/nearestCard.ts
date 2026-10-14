/** İmlecin altındaki kartı, yoksa imlece en yakın kartı döndürür (kartlar arası boşlukta da çalışsın). */
export function cardAt(root: HTMLElement, e: MouseEvent, selector: string): HTMLElement | null {
  const direct = (e.target as HTMLElement).closest<HTMLElement>(selector);
  if (direct) return direct;
  let best: HTMLElement | null = null;
  let bestD = Infinity;
  const box = root.getBoundingClientRect();
  for (const el of root.querySelectorAll<HTMLElement>(selector)) {
    const r = el.getBoundingClientRect();
    if (r.bottom < box.top || r.top > box.bottom) continue; // görünmeyenleri atla
    const d = Math.hypot(r.left + r.width / 2 - e.clientX, r.top + r.height / 2 - e.clientY);
    if (d < bestD) {
      bestD = d;
      best = el;
    }
  }
  return best;
}
