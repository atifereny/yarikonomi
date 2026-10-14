import { AnimatePresence, motion, useDragControls } from "framer-motion";
import { type ButtonHTMLAttributes, type ReactNode, useId } from "react";
import { useEscape, useSheetRegistration } from "../lib/hooks";
import { sheetSpring, spring } from "../lib/motion";
import { formatSignedTL, formatTL } from "../lib/money";
import type { Direction } from "../lib/summary";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

// --- Butonlar ----------------------------------------------------------------

type BtnVariant =
  "primary" | "secondary" | "plain" | "destructive" | "destructivePlain";

export function Button({
  variant = "secondary",
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant }) {
  const styles: Record<BtnVariant, string> = {
    primary: "bg-blue text-white hover:brightness-110 active:brightness-95",
    secondary: "bg-fill text-blue hover:bg-fill2",
    plain: "text-blue hover:bg-fill",
    destructive: "bg-red text-white hover:brightness-110",
    destructivePlain: "text-red hover:bg-red/10",
  };
  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      transition={spring}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 h-9 text-[14px] font-semibold transition-colors disabled:opacity-40 disabled:pointer-events-none",
        styles[variant],
        className,
      )}
      {...(rest as object)}
    >
      {children}
    </motion.button>
  );
}

export function IconButton({
  className,
  children,
  label,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <motion.button
      whileTap={{ scale: 0.88 }}
      transition={spring}
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex items-center justify-center rounded-full w-9 h-9 text-blue hover:bg-fill transition-colors disabled:opacity-40",
        className,
      )}
      {...(rest as object)}
    >
      {children}
    </motion.button>
  );
}

// --- Segmented control -------------------------------------------------------

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: { value: T; label: ReactNode; activeClass?: string }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  const id = useId();
  return (
    <div
      className={cx("relative flex rounded-[10px] bg-fill p-0.5", className)}
      role="radiogroup"
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cx(
              "relative flex-1 h-8 px-3 rounded-[8px] text-[13px] font-medium transition-colors whitespace-nowrap",
              active
                ? (o.activeClass ?? "text-label")
                : "text-label2 hover:text-label",
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                transition={spring}
                className="absolute inset-0 rounded-[8px] bg-card dark:bg-[#636366] shadow-[0_1px_4px_rgba(0,0,0,0.12)]"
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// --- Sheet / modal -----------------------------------------------------------

export function Sheet({
  open,
  onClose,
  children,
  variant = "center",
  width = 460,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  variant?: "center" | "bottom";
  width?: number;
}) {
  const drag = useDragControls();
  useEscape(open, onClose);
  useSheetRegistration(open);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-40 flex items-end justify-center">
          <motion.div
            className="absolute inset-0 bg-black/30 dark:bg-black/55"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            onClick={onClose}
          />
          {variant === "bottom" ? (
            <motion.div
              className="relative w-full max-w-[640px] max-h-[82vh] flex flex-col rounded-t-[22px] bg-bg shadow-pop overflow-hidden"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={sheetSpring}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0.05, bottom: 0.6 }}
              dragListener={false}
              dragControls={drag}
              onDragEnd={(_, info) => {
                if (info.offset.y > 120 || info.velocity.y > 600) onClose();
              }}
              role="dialog"
              aria-modal="true"
            >
              <div
                className="flex justify-center pt-2 pb-1 shrink-0 touch-none cursor-grab active:cursor-grabbing"
                onPointerDown={(e) => drag.start(e)}
              >
                <span className="w-9 h-[5px] rounded-full bg-label3" />
              </div>
              {children}
            </motion.div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-6">
              <motion.div
                className="relative pointer-events-auto max-h-[90vh] w-full flex flex-col rounded-[18px] bg-bg shadow-pop overflow-hidden"
                style={{ maxWidth: width }}
                initial={{ opacity: 0, scale: 0.94, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 10 }}
                transition={sheetSpring}
                role="dialog"
                aria-modal="true"
              >
                {children}
              </motion.div>
            </div>
          )}
        </div>
      )}
    </AnimatePresence>
  );
}

/** iOS modal başlığı: sol "Vazgeç", ortada başlık, sağda birincil eylem */
export function SheetHeader({
  title,
  onCancel,
  action,
  cancelLabel = "Vazgeç",
}: {
  title: ReactNode;
  onCancel?: () => void;
  action?: ReactNode;
  cancelLabel?: string;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center px-3 h-14 shrink-0 border-b border-sep">
      <div>
        {onCancel && (
          <Button variant="plain" onClick={onCancel} className="font-normal">
            {cancelLabel}
          </Button>
        )}
      </div>
      <div className="text-[15px] font-semibold truncate">{title}</div>
      <div className="flex justify-end">{action}</div>
    </div>
  );
}

// --- Gruplu liste (iOS Settings tarzı) --------------------------------------

export function Group({
  title,
  footer,
  children,
  className,
}: {
  title?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("mb-6", className)}>
      {title && (
        <h3 className="px-4 mb-1.5 text-[12px] uppercase tracking-wide text-label2">
          {title}
        </h3>
      )}
      <div className="rounded-[12px] bg-card shadow-card overflow-hidden divide-y divide-sep">
        {children}
      </div>
      {footer && (
        <p className="px-4 mt-1.5 text-[12px] text-label2 leading-snug">
          {footer}
        </p>
      )}
    </section>
  );
}

export function Row({
  children,
  className,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={cx(
        "flex items-center gap-3 px-4 min-h-11 py-2",
        onClick && "hover:bg-fill/60 active:bg-fill transition-colors",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function FieldRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex items-center gap-3 px-4 min-h-11 py-1.5">
      <span className="w-28 shrink-0 text-label">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </label>
  );
}

export const inputClass =
  "w-full bg-transparent outline-none placeholder:text-label3 py-1.5";

// --- Para / nokta göstergeleri ----------------------------------------------

export function Money({
  value,
  signed,
  className,
}: {
  value: number;
  signed?: boolean;
  className?: string;
}) {
  const color =
    value > 0 ? "text-green" : value < 0 ? "text-red" : "text-label2";
  return (
    <span className={cx("tabular", signed && color, className)}>
      {signed ? formatSignedTL(value) : formatTL(value)}
    </span>
  );
}

export function DirectionAmount({
  direction,
  amount,
  className,
}: {
  direction: Direction;
  amount: number;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "tabular font-semibold",
        direction === "alacak" ? "text-green" : "text-red",
        className,
      )}
    >
      {direction === "alacak" ? "+" : "−"}
      {formatTL(amount)}
    </span>
  );
}

export function Dots({
  dots,
  extra,
  size = 6,
}: {
  dots: Direction[];
  extra: number;
  size?: number;
}) {
  return (
    <div className="flex items-center gap-[3px] flex-wrap">
      {dots.map((d, i) => (
        <span
          key={i}
          className={cx(
            "rounded-full shrink-0",
            d === "alacak" ? "bg-green" : "bg-red dot-neg",
          )}
          style={{ width: size, height: size }}
        />
      ))}
      {extra > 0 && (
        <span className="text-[10px] leading-none font-semibold text-label2 ml-0.5">
          +{extra}
        </span>
      )}
    </div>
  );
}

export function Empty({
  icon,
  title,
  text,
  children,
}: {
  icon?: ReactNode;
  title: string;
  text?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6 text-label2">
      {icon && <div className="mb-3 text-label3">{icon}</div>}
      <div className="text-[15px] font-semibold text-label">{title}</div>
      {text && <div className="mt-1 text-[13px] max-w-xs">{text}</div>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

export function StatusPill({
  tone,
  children,
}: {
  tone: "paid" | "pending" | "failed";
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2 h-5 text-[11px] font-semibold",
        tone === "paid"
          ? "bg-green/15 text-green"
          : tone === "failed"
            ? "bg-red/15 text-red"
            : "bg-orange/15 text-orange",
      )}
    >
      {children}
    </span>
  );
}
