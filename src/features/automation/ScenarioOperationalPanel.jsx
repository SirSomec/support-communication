import React from "react";
import { AlertTriangle, BookOpenCheck, Coins, GitBranch, Radio, Shuffle } from "lucide-react";
import { SectionTitle, StatusBadge } from "../../ui.jsx";
import { buildScenarioOperationalView } from "./automationModel.js";

export function ScenarioOperationalPanel({ aiUsage = null, operations = null, scenarioName = "" }) {
  const view = buildScenarioOperationalView(operations, aiUsage);

  return (
    <section className="work-panel scenario-ops-panel" aria-label={`Эксплуатация сценария ${scenarioName}`}>
      <SectionTitle title="Эксплуатация сценария" action={scenarioName || "выбранный сценарий"} />
      <div className="scenario-ops-summary">
        <StatusBadge tone={view.statusTone}>{view.statusLabel}</StatusBadge>
        <span><Radio size={14} aria-hidden="true" /> Ошибки: {view.failureCount}</span>
        <span><GitBranch size={14} aria-hidden="true" /> Публикации: {view.publishCount}</span>
        <span><Shuffle size={14} aria-hidden="true" /> Передачи: {view.handoffCount}</span>
      </div>

      <dl className="scenario-ops-grid">
        <div>
          <dt>Причина fallback / handoff</dt>
          <dd>{view.fallbackReasonLabel}</dd>
        </div>
        <div>
          <dt>Последние citations</dt>
          <dd><BookOpenCheck size={14} aria-hidden="true" /> {view.citationsLabel}</dd>
        </div>
        {view.usage ? (
          <div>
            <dt>AI usage / cost ({view.usage.month})</dt>
            <dd><Coins size={14} aria-hidden="true" /> {view.usage.budgetLabel} · {view.usage.costLabel}</dd>
          </div>
        ) : (
          <div>
            <dt>AI usage / cost</dt>
            <dd>Доступно администратору настроек или Service Admin</dd>
          </div>
        )}
      </dl>

      <div className="scenario-ops-lists">
        <OpsList empty="Сбоев пока нет" icon={<AlertTriangle size={14} />} items={view.failures} title="Последние failures" />
        <OpsList empty="Публикаций пока нет" items={view.publishes} title="Публикации" />
        <OpsList empty="Передач пока нет" items={view.handoffs} title="Передачи оператору" />
      </div>
    </section>
  );
}

function OpsList({ empty, icon = null, items, title }) {
  return (
    <div className="scenario-ops-list">
      <strong>{title}</strong>
      {items.length ? (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              {icon}
              <time>{item.when}</time>
              <span>{item.detail}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p>{empty}</p>
      )}
    </div>
  );
}
