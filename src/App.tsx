import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { UpdateBanner } from "./components/UpdateBanner";
import { Dock, type View } from "./components/Dock";
import { type AppInfo, api, errorText } from "./lib/api";
import { softSpring } from "./lib/motion";
import { useColorblind } from "./lib/colorblind";
import { useUiScale } from "./lib/uiScale";
import { AppProvider, useThemeClass } from "./state";
import { CalendarView } from "./views/calendar/CalendarView";
import { EntriesView } from "./views/EntriesView";
import { ContactsView } from "./views/ContactsView";
import { RecoveryScreen } from "./views/RecoveryScreen";
import { SettingsView } from "./views/SettingsView";

function Shell() {
  const [view, setView] = useState<View>("calendar");

  useEffect(() => {
    const onNav = (e: Event) => setView((e as CustomEvent<View>).detail);
    window.addEventListener("muhasebe:navigate", onNav);
    return () => window.removeEventListener("muhasebe:navigate", onNav);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return;
      if (e.key === "1") setView("calendar");
      else if (e.key === "2") setView("entries");
      else if (e.key === "3") setView("contacts");
      else if (e.key === "4") setView("settings");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="h-full">
      {/* Altta içeriğin sert kesilmesi yerine yumuşak geçiş */}
      <div className="fixed inset-x-0 bottom-0 h-32 z-20 pointer-events-none bg-gradient-to-t from-bg via-bg/80 to-transparent" />
      <Dock view={view} onChange={setView} />
      <UpdateBanner />
      <main className="relative h-full">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={view}
            initial={{ opacity: 0, scale: 0.985, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.985 }}
            transition={{ ...softSpring, opacity: { duration: 0.15 } }}
            className="absolute inset-0"
          >
            {/* Tam ekranda içerik yayvanlaşmasın: genişlik sınırlı ve ortalı */}
            <div
              className={`h-full w-full mx-auto ${view === "calendar" ? "" : "max-w-[1180px]"}`}
            >
              {view === "calendar" && <CalendarView />}
              {view === "entries" && <EntriesView />}
              {view === "contacts" && <ContactsView />}
              {view === "settings" && <SettingsView />}
            </div>
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

export default function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);

  const refreshInfo = useCallback(async () => {
    try {
      setInfo(await api.appInfo());
      setFatal(null);
    } catch (e) {
      setFatal(errorText(e));
    }
  }, []);

  useEffect(() => {
    refreshInfo();
  }, [refreshInfo]);

  useThemeClass(info?.theme ?? "system");
  useUiScale();
  useColorblind();

  if (fatal) {
    return (
      <div className="h-full flex items-center justify-center p-8 text-center">
        <div>
          <div className="text-[20px] font-semibold">
            Uygulama başlatılamadı
          </div>
          <div className="mt-2 text-label2 selectable">{fatal}</div>
        </div>
      </div>
    );
  }
  if (!info) return null;
  if (info.status.state !== "ready")
    return <RecoveryScreen info={info} onRecovered={refreshInfo} />;

  return (
    <AppProvider info={info} refreshInfo={refreshInfo}>
      <Shell />
    </AppProvider>
  );
}
