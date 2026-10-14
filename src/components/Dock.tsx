import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";
import { useSheetOpen } from "../lib/hooks";
import { spring } from "../lib/motion";
import { CalendarIcon, GearIcon, ListIcon, PeopleIcon } from "./icons";
import { cx } from "./ui";

export type View = "calendar" | "entries" | "contacts" | "settings";

const ITEMS: { id: View; label: string; icon: ReactNode; key: string }[] = [
  {
    id: "calendar",
    label: "Takvim",
    icon: <CalendarIcon size={24} />,
    key: "1",
  },
  { id: "entries", label: "Kayıtlar", icon: <ListIcon size={24} />, key: "2" },
  {
    id: "contacts",
    label: "Kişiler",
    icon: <PeopleIcon size={24} />,
    key: "3",
  },
  { id: "settings", label: "Ayarlar", icon: <GearIcon size={24} />, key: "4" },
];

/** Ekranın altında ortada yüzen, yalnızca ikonlu "liquid glass" menü. Panel açılınca kaybolur. */
export function Dock({
  view,
  onChange,
}: {
  view: View;
  onChange: (v: View) => void;
}) {
  const sheetOpen = useSheetOpen();
  return (
    <AnimatePresence>
      {!sheetOpen && (
        <div className="fixed inset-x-0 bottom-5 z-30 flex justify-center pointer-events-none">
          <motion.nav
            initial={{ y: 90, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 90, opacity: 0, scale: 0.9 }}
            transition={spring}
            className="glass pointer-events-auto flex items-center gap-1 p-1.5 rounded-full"
          >
            {ITEMS.map((it) => {
              const active = it.id === view;
              return (
                <motion.button
                  key={it.id}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  transition={spring}
                  onClick={() => onChange(it.id)}
                  title={`${it.label} (Ctrl+${it.key})`}
                  aria-label={it.label}
                  className={cx(
                    "relative w-14 h-12 rounded-full flex items-center justify-center transition-colors",
                    active ? "text-blue" : "text-label2 hover:text-label",
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="dock-active"
                      transition={spring}
                      className="glass-lens absolute inset-0 rounded-full"
                    />
                  )}
                  <span className="relative">{it.icon}</span>
                </motion.button>
              );
            })}
          </motion.nav>
        </div>
      )}
    </AnimatePresence>
  );
}
