// Shared UI primitives: Panel, Stat, DeltaChip, Field, Modal, Spinner, Segmented.
import { useEffect, useRef } from "react";
import { fmtMoney, fmtPct } from "../lib/api";
import "./ui.css";

export function Panel({ title, action, className = "", children, ...rest }) {
  return (
    <section className={`panel ${className}`} {...rest}>
      {(title || action) && (
        <header className="panel__head">
          {title && <h3 className="panel__title">{title}</h3>}
          {action && <div className="panel__action">{action}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, delta, deltaTone, mono = true, accent }) {
  return (
    <div className="stat">
      <span className="stat__label">{label}</span>
      <span className={`stat__value ${mono ? "mono" : ""}`} style={accent ? { color: accent } : undefined}>
        {value}
      </span>
      {delta !== undefined && delta !== null && (
        <DeltaChip value={delta} tone={deltaTone} />
      )}
    </div>
  );
}

export function DeltaChip({ value, tone, children }) {
  const t = tone || (value >= 0 ? "gain" : "loss");
  return <span className={`chip chip--${t} mono`}>{children ?? fmtPct(value)}</span>;
}

export function MoneyDelta({ now, prev, invert = false }) {
  // invert=true means "down is good" (e.g. spending less than last period).
  if (prev === undefined || prev === null) return null;
  const diff = now - prev;
  const good = invert ? diff <= 0 : diff >= 0;
  return (
    <span className={`chip chip--${good ? "gain" : "loss"} mono`}>
      {diff >= 0 ? "+" : ""}
      {fmtMoney(diff)}
    </span>
  );
}

export function Field({ label, children, hint }) {
  return (
    <label className="field">
      {label && <span className="field__label">{label}</span>}
      {children}
      {hint && <span className="field__hint">{hint}</span>}
    </label>
  );
}

export function Spinner({ label = "Loading" }) {
  return (
    <div className="spinner" role="status" aria-live="polite">
      <span className="spinner__dot" />
      <span className="spinner__dot" />
      <span className="spinner__dot" />
      <span className="visually-hidden">{label}</span>
    </div>
  );
}

export function Segmented({ options, value, onChange, size }) {
  return (
    <div className={`segmented ${size === "sm" ? "segmented--sm" : ""}`} role="tablist">
      {options.map((o) => {
        const val = typeof o === "string" ? o : o.value;
        const lab = typeof o === "string" ? o : o.label;
        return (
          <button
            key={val}
            role="tab"
            aria-selected={value === val}
            className={`segmented__btn ${value === val ? "is-active" : ""}`}
            onClick={() => onChange(val)}
          >
            {lab}
          </button>
        );
      })}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "modal--wide" : ""}`}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <div className="modal__inner">
          <header className="modal__head">
            <h3>{title}</h3>
            <button className="icon-btn" aria-label="Close" onClick={onClose}>
              ✕
            </button>
          </header>
          <div className="modal__body">{children}</div>
        </div>
      )}
    </dialog>
  );
}

export function EmptyState({ icon = "○", title, hint }) {
  return (
    <div className="empty">
      <span className="empty__icon" aria-hidden>
        {icon}
      </span>
      <p className="empty__title">{title}</p>
      {hint && <p className="empty__hint">{hint}</p>}
    </div>
  );
}
