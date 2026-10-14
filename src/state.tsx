import { AnimatePresence, motion } from "framer-motion";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type AppInfo,
  type Contact,
  type Entry,
  type Theme,
  api,
} from "./lib/api";
import { useEscape } from "./lib/hooks";
import { spring } from "./lib/motion";
import { ContactForm } from "./components/ContactForm";
import { EntryForm } from "./components/EntryForm";
import { ExportDialog, type ExportRequest } from "./components/ExportDialog";
import { PaymentDialog, type PaymentRequest } from "./components/PaymentDialog";
import { cx } from "./components/ui";

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmText?: string;
  destructive?: boolean;
}

export interface EntryEditorRequest {
  entry?: Entry;
  date?: string;
  contactId?: number;
}

export interface ContactEditorRequest {
  contact?: Contact;
  onSaved?: (c: Contact) => void;
}

interface Ctx {
  info: AppInfo;
  refreshInfo: () => Promise<void>;
  /** Her yazma işleminden sonra artar; ekranlar buna göre veriyi yeniden yükler */
  version: number;
  bump: () => void;
  toast: (message: string, kind?: "info" | "error") => void;
  confirm: (o: ConfirmOptions) => Promise<boolean>;
  editEntry: (r: EntryEditorRequest) => void;
  editContact: (r: ContactEditorRequest) => void;
  /** Dönem raporu ya da cari ekstre indirme penceresini açar */
  exportReport: (r: ExportRequest) => void;
  /** Kısmi ödeme ya da toplu tahsilat / ödeme penceresini açar */
  addPayment: (r: PaymentRequest) => void;
}

const AppCtx = createContext<Ctx | null>(null);

export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error("AppProvider eksik");
  return c;
}

/** html.dark sınıfını tema ayarına ve sistem temasına göre günceller */
export function useThemeClass(theme: Theme) {
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && mq.matches);
      document.documentElement.classList.toggle("dark", dark);
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);
}

interface Toast {
  id: number;
  message: string;
  kind: "info" | "error";
}

export function AppProvider({
  info,
  refreshInfo,
  children,
}: {
  info: AppInfo;
  refreshInfo: () => Promise<void>;
  children: ReactNode;
}) {
  const [version, setVersion] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<
    (ConfirmOptions & { resolve: (v: boolean) => void }) | null
  >(null);
  const [entryReq, setEntryReq] = useState<EntryEditorRequest | null>(null);
  const [contactReq, setContactReq] = useState<ContactEditorRequest | null>(
    null,
  );
  const [exportReq, setExportReq] = useState<ExportRequest | null>(null);
  const [paymentReq, setPaymentReq] = useState<PaymentRequest | null>(null);
  const toastId = useRef(0);

  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const toast = useCallback(
    (message: string, kind: "info" | "error" = "info") => {
      const id = ++toastId.current;
      setToasts((t) => [...t, { id, message, kind }]);
      setTimeout(
        () => setToasts((t) => t.filter((x) => x.id !== id)),
        kind === "error" ? 6000 : 2600,
      );
    },
    [],
  );

  const confirm = useCallback(
    (o: ConfirmOptions) =>
      new Promise<boolean>((resolve) => setConfirmState({ ...o, resolve })),
    [],
  );

  const closeConfirm = (v: boolean) => {
    confirmState?.resolve(v);
    setConfirmState(null);
  };

  useEscape(!!confirmState, () => closeConfirm(false));

  const value = useMemo<Ctx>(
    () => ({
      info,
      refreshInfo,
      version,
      bump,
      toast,
      confirm,
      editEntry: setEntryReq,
      editContact: setContactReq,
      exportReport: setExportReq,
      addPayment: setPaymentReq,
    }),
    [info, refreshInfo, version, bump, toast, confirm],
  );

  return (
    <AppCtx.Provider value={value}>
      {children}

      <EntryForm request={entryReq} onClose={() => setEntryReq(null)} />
      <ContactForm request={contactReq} onClose={() => setContactReq(null)} />
      <ExportDialog request={exportReq} onClose={() => setExportReq(null)} />
      <PaymentDialog request={paymentReq} onClose={() => setPaymentReq(null)} />

      {/* Onay iletişim kutusu (iOS alert) */}
      <AnimatePresence>
        {confirmState && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center">
            <motion.div
              className="absolute inset-0 bg-black/30 dark:bg-black/55"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => closeConfirm(false)}
            />
            <motion.div
              role="alertdialog"
              className="relative w-[290px] rounded-[16px] bg-elevated/95 backdrop-blur-xl shadow-pop overflow-hidden text-center"
              initial={{ opacity: 0, scale: 1.12 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={spring}
            >
              <div className="px-5 pt-5 pb-4">
                <div className="text-[16px] font-semibold">
                  {confirmState.title}
                </div>
                {confirmState.message && (
                  <div className="mt-1.5 text-[13px] text-label2 leading-snug">
                    {confirmState.message}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 border-t border-sep">
                <button
                  className="h-11 text-blue text-[16px] hover:bg-fill border-r border-sep"
                  onClick={() => closeConfirm(false)}
                >
                  Vazgeç
                </button>
                <button
                  autoFocus
                  className={cx(
                    "h-11 text-[16px] font-semibold hover:bg-fill",
                    confirmState.destructive ? "text-red" : "text-blue",
                  )}
                  onClick={() => closeConfirm(true)}
                >
                  {confirmState.confirmText ?? "Tamam"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Bildirimler */}
      <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[70] flex flex-col items-center gap-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={spring}
              className={cx(
                "px-4 py-2.5 rounded-full shadow-pop text-[13px] font-medium backdrop-blur-xl max-w-[520px] text-center",
                t.kind === "error"
                  ? "bg-red text-white"
                  : "bg-elevated/95 text-label",
              )}
            >
              {t.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </AppCtx.Provider>
  );
}

/**
 * Tauri komutu çağırır; hata olursa bildirim gösterir.
 * Hata durumunda `undefined`, başarılı ve değersiz (void) komutlarda `null` döner.
 */
export function useRunner() {
  const { toast } = useApp();
  return useCallback(
    async <T,>(
      fn: () => Promise<T>,
      success?: string,
    ): Promise<T | null | undefined> => {
      try {
        const r = await fn();
        if (success) toast(success);
        return r === undefined ? null : r;
      } catch (e) {
        toast(typeof e === "string" ? e : String(e), "error");
        return undefined;
      }
    },
    [toast],
  );
}

export { api };
