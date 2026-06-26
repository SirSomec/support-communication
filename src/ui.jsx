import React from "react";
import { AlertTriangle, CheckCircle2, ChevronLeft, CircleGauge, Inbox, LoaderCircle } from "lucide-react";

const stateIcons = {
  loading: LoaderCircle,
  ok: CheckCircle2,
  empty: Inbox,
  error: AlertTriangle,
  warn: AlertTriangle
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

export function Toast({ message, onClose }) {
  return (
    <button aria-live="polite" className="toast" onClick={onClose} role="status" type="button">
      <CircleGauge size={18} />
      {message}
    </button>
  );
}
