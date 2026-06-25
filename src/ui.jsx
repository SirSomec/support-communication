import React from "react";
import { ChevronLeft } from "lucide-react";

export function ProductScreen({ title, subtitle, onBack, actions, children }) {
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
      {children}
    </section>
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
