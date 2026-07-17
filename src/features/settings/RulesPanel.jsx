import React, { useEffect, useMemo, useState } from "react";
import { ClipboardCheck, KeyRound, Loader2, Route, ShieldCheck } from "lucide-react";
import { ConfirmDialog } from "../../ui.jsx";
import { SettingsSectionHeader } from "./SettingsPrimitives.jsx";
import { settingsService } from "../../services/settingsService.js";
import { normalizeRuleParameter } from "./rulesModel.js";

const iconByRule = {
  "close-topic-required": ClipboardCheck,
  "internal-note-is-private": ShieldCheck,
  "operator-chat-limit": Route,
  "report-export-audit": KeyRound
};

const severityLabel = {
  critical: "Критичное",
  high: "Высокое",
  medium: "Среднее"
};

export function RulesPanel({ access, canEditSettings, onToast }) {
  const [workspace, setWorkspace] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyRuleId, setBusyRuleId] = useState("");
  const [testResults, setTestResults] = useState({});
  const [ruleToDisable, setRuleToDisable] = useState(null);
  const canMutateRules = canEditSettings && !error;

  useEffect(() => {
    let cancelled = false;

    async function loadRules() {
      setLoading(true);
      setError("");
      const response = await settingsService.fetchRules();
      if (cancelled) {
        return;
      }

      if (response.status === "ok") {
        setWorkspace(response.data);
      } else {
        setError(response.error?.message ?? "Не удалось загрузить правила.");
      }
      setLoading(false);
    }

    loadRules();

    return () => {
      cancelled = true;
    };
  }, []);

  const rules = workspace?.rules ?? [];
  const activeCount = workspace?.totals?.active ?? rules.filter((rule) => rule.enabled).length;
  const actionLabel = useMemo(() => (
    loading ? "Загрузка" : `${activeCount} активных правил`
  ), [activeCount, loading]);

  async function updateRule(rule, payload) {
    setBusyRuleId(rule.id);
    setError("");
    const response = await settingsService.updateRule({ ruleId: rule.id, ...payload });
    setBusyRuleId("");

    if (response.status !== "ok") {
      setError(response.error?.message ?? "Не удалось сохранить правило.");
      return;
    }

    setWorkspace(response.data.workspace);
    onToast?.(`${response.data.rule.title}: изменения сохранены. Аудит ${response.data.auditEvent.id}.`);
  }

  async function toggleRule(rule) {
    const nextEnabled = !rule.enabled;

    if (!nextEnabled && rule.severity === "critical") {
      setRuleToDisable(rule);
      return;
    }

    await updateRule(rule, {
      confirmed: false,
      enabled: nextEnabled,
      reason: nextEnabled ? "Rule enabled from settings" : "Rule disabled from settings"
    });
  }

  async function confirmDisableRule() {
    const rule = ruleToDisable;
    setRuleToDisable(null);
    if (!rule) {
      return;
    }

    await updateRule(rule, {
      confirmed: true,
      enabled: false,
      reason: "Rule disabled from settings"
    });
  }

  async function testRule(rule) {
    setBusyRuleId(rule.id);
    setError("");
    const response = await settingsService.testRule({ ruleId: rule.id, sampleSize: 50 });
    setBusyRuleId("");

    if (response.status !== "ok") {
      setError(response.error?.message ?? "Не удалось проверить правило.");
      return;
    }

    setTestResults((current) => ({
      ...current,
      [rule.id]: response.data.result
    }));
    onToast?.(`${rule.title}: проверка выполнена. Аудит ${response.data.auditEvent.id}.`);
  }

  async function updateParameter(rule, key, value) {
    const currentValue = rule.parameters?.[key];
    const { changed, value: normalizedValue } = normalizeRuleParameter(currentValue, value);
    if (!changed) return false;
    await updateRule(rule, {
      parameters: { [key]: normalizedValue },
      reason: `Rule parameter ${key} changed from settings`
    });
    return true;
  }

  return (
    <section className="settings-section settings-rules-workspace">
      <SettingsSectionHeader
        title="Правила"
        meta={actionLabel}
        hint="Правила задают реальные ограничения обработки обращений: закрытие, маршрутизацию, экспорт и аудит. Каждое изменение фиксируется с trace и audit id."
      />

      <div className="settings-card settings-rules-card">
      {error ? <div className="settings-rule-error">{error}</div> : null}
      {loading ? (
        <div className="settings-rule-state"><Loader2 size={16} /> Загружаем правила</div>
      ) : null}
      {!loading && !rules.length ? (
        <div className="settings-rule-state">Правила не настроены.</div>
      ) : null}

      <div className="settings-rule-list settings-scroll">
        {rules.map((rule) => {
          const Icon = iconByRule[rule.id] ?? ShieldCheck;
          const busy = busyRuleId === rule.id;
          const result = testResults[rule.id];

          return (
            <article className={`settings-rule-card ${rule.severity} ${rule.enabled ? "enabled" : "disabled"}`} key={rule.id}>
              <Icon size={19} />
              <div>
                <strong>{rule.title}</strong>
                <p>{rule.description}</p>
                <div className="settings-rule-parameters">
                  {Object.entries(rule.parameters ?? {}).map(([key, value]) => (
                    <label key={key}>
                      <span>{key}</span>
                      {typeof value === "boolean" ? (
                        <input
                          checked={value}
                          disabled={!canMutateRules || busy}
                          onChange={(event) => updateParameter(rule, key, event.target.checked)}
                          type="checkbox"
                        />
                      ) : (
                        <input
                          defaultValue={value}
                          disabled={!canMutateRules || busy}
                          onBlur={async (event) => {
                            const input = event.currentTarget;
                            const changed = await updateParameter(rule, key, input.value);
                            if (!changed) input.value = String(value);
                          }}
                          type={typeof value === "number" ? "number" : "text"}
                        />
                      )}
                    </label>
                  ))}
                </div>
              </div>
              <dl>
                <div>
                  <dt>Область</dt>
                  <dd>{rule.scope}</dd>
                </div>
                <div>
                  <dt>Владелец</dt>
                  <dd>{rule.owner}</dd>
                </div>
                <div>
                  <dt>Последнее событие</dt>
                  <dd>{rule.lastViolation}</dd>
                </div>
                <div>
                  <dt>Сценарии</dt>
                  <dd>{rule.affectedWorkflows.join(", ")}</dd>
                </div>
                <div>
                  <dt>Изменено</dt>
                  <dd>{formatDate(rule.lastChangedAt)}</dd>
                </div>
                <div>
                  <dt>Статус</dt>
                  <dd>{rule.enabled ? "Включено" : "Выключено"}</dd>
                </div>
              </dl>
              <footer>
                <span>{severityLabel[rule.severity] ?? rule.severity}</span>
                <button
                  disabled={!canMutateRules || busy}
                  onClick={() => testRule(rule)}
                  title={canMutateRules ? "Проверить правило" : access.reason}
                  type="button"
                >
                  {busy ? "Ждем" : "Проверить"}
                </button>
                <button
                  className={rule.enabled ? "danger" : "primary"}
                  disabled={!canMutateRules || busy}
                  onClick={() => toggleRule(rule)}
                  title={canMutateRules ? "Изменить состояние правила" : access.reason}
                  type="button"
                >
                  {rule.enabled ? "Выключить" : "Включить"}
                </button>
                {result ? (
                  <div className="settings-rule-test-result">
                    {result.summary}
                  </div>
                ) : null}
              </footer>
            </article>
          );
        })}
      </div>
      </div>

      {ruleToDisable ? (
        <ConfirmDialog
          confirmLabel="Отключить"
          danger
          description={`Правило «${ruleToDisable.title}» критичное и влияет на реальные ограничения обработки. Отключить его?`}
          eyebrow="Критичное правило"
          onCancel={() => setRuleToDisable(null)}
          onConfirm={confirmDisableRule}
          title="Отключить правило?"
        />
      ) : null}
    </section>
  );
}

function formatDate(value) {
  if (!value) {
    return "Нет данных";
  }

  try {
    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(value));
  } catch {
    return value;
  }
}
