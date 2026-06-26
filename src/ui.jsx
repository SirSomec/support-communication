import React from "react";
import { AlertTriangle, CheckCircle2, ChevronLeft, CircleGauge, Inbox, LoaderCircle, Search, X } from "lucide-react";
import { useModalA11y } from "./app/useModalA11y.js";

const stateIcons = {
  loading: LoaderCircle,
  ok: CheckCircle2,
  empty: Inbox,
  error: AlertTriangle,
  warn: AlertTriangle
};

const visuallyHiddenStyle = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0
};

export function ProductScreen({ title, subtitle, onBack, actions, stateItems = [], children }) {
  return (
    <section className="product-screen">
      <header className="product-header">
        <div>
          <button className="back-link" onClick={onBack} type="button">
            <ChevronLeft size={18} />
            Диалоги
          </button>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        <div className="product-actions">{actions}</div>
      </header>
      {stateItems.length ? <ScreenStateStrip items={stateItems} /> : null}
      {children}
    </section>
  );
}

export function ScreenStateStrip({ items }) {
  return (
    <div className="screen-state-strip" aria-label="Состояния экрана">
      {items.map((item) => {
        const Icon = stateIcons[item.tone] ?? CheckCircle2;

        return (
          <article className={`screen-state-item ${item.tone ?? "ok"}`} key={item.label}>
            <Icon size={16} />
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </article>
        );
      })}
    </div>
  );
}

export function MetricTile({ icon, label, value, detail, tone }) {
  return (
    <article className={`metric-tile ${tone ?? ""}`}>
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

export function SectionTitle({ title, action }) {
  return (
    <header className="section-title">
      <h2>{title}</h2>
      <span>{action}</span>
    </header>
  );
}

export function EntityTable({
  as: Component = "section",
  caption,
  children,
  className = "",
  columns,
  empty,
  headClassName = "",
  headStyle
}) {
  if (Component === "table") {
    return (
      <table className={["entity-table", className].filter(Boolean).join(" ")} style={{ width: "100%" }}>
        {caption ? <caption style={visuallyHiddenStyle}>{caption}</caption> : null}
        <thead>
          <tr className={["entity-head", headClassName].filter(Boolean).join(" ")} style={headStyle}>
            {columns.map((column) => {
              const key = typeof column === "string" ? column : column.id;
              const label = typeof column === "string" ? column : column.label;

              return <th key={key} scope="col" style={{ textAlign: "left" }}>{label}</th>;
            })}
          </tr>
        </thead>
        <tbody>{children}</tbody>
        {empty}
      </table>
    );
  }

  return (
    <Component className={["entity-table", className].filter(Boolean).join(" ")}>
      <div className={["entity-head", headClassName].filter(Boolean).join(" ")} style={headStyle}>
        {columns.map((column) => {
          const key = typeof column === "string" ? column : column.id;
          const label = typeof column === "string" ? column : column.label;

          return <span key={key}>{label}</span>;
        })}
      </div>
      {children}
      {empty}
    </Component>
  );
}

export function ChannelBadge({ channel }) {
  return <span className={`channel-chip ${String(channel).toLowerCase()}`}>{channel}</span>;
}

export function ChannelList({ channels }) {
  return (
    <div className="mini-channel-list">
      {channels.map((channel) => <ChannelBadge channel={channel} key={channel} />)}
    </div>
  );
}

export function Permission({ enabled }) {
  return enabled ? <span className="permission yes">Да</span> : <span className="permission no">Нет</span>;
}

export function StatusBadge({ children, tone = "info" }) {
  return <span className={`status-chip ${tone}`}>{children}</span>;
}

export function Toast({ message, onClose }) {
  return (
    <button aria-live="polite" className="toast" onClick={onClose} role="status" type="button">
      <CircleGauge size={18} />
      {message}
    </button>
  );
}

export function ToolbarSearch({ ariaLabel, className = "", iconSize = 18, onChange, placeholder, value }) {
  return (
    <label className={["toolbar-search", className].filter(Boolean).join(" ")}>
      <Search size={iconSize} />
      <input
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

export function SegmentedControl({ ariaLabel, className = "", onChange, options, value }) {
  return (
    <div className={["segmented-control", className].filter(Boolean).join(" ")} role="group" aria-label={ariaLabel}>
      {options.map((option) => {
        const optionValue = typeof option === "string" ? option : option.value;
        const label = typeof option === "string" ? option : option.label;

        return (
          <button
            aria-pressed={value === optionValue}
            className={value === optionValue ? "active" : ""}
            key={optionValue}
            onClick={() => onChange(optionValue)}
            type="button"
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function Modal({
  children,
  closeLabel = "Закрыть",
  eyebrow,
  footer,
  onClose,
  overlayClassName,
  panelClassName,
  title,
  titleId
}) {
  const dialogRef = useModalA11y(onClose);

  return (
    <div className={overlayClassName} role="presentation">
      <section className={panelClassName} aria-labelledby={titleId} aria-modal="true" ref={dialogRef} role="dialog">
        <header>
          <div>
            {eyebrow ? <span>{eyebrow}</span> : null}
            <h2 id={titleId}>{title}</h2>
          </div>
          <button aria-label={closeLabel} className="icon-button" onClick={onClose} title={closeLabel} type="button">
            <X size={18} />
          </button>
        </header>
        {children}
        {footer ? <footer>{footer}</footer> : null}
      </section>
    </div>
  );
}
