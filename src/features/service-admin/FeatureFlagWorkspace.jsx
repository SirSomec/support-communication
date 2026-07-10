import React, { useEffect, useMemo, useState } from "react";
import { Eye, Flag, ShieldAlert, SlidersHorizontal } from "lucide-react";
import { SectionTitle, StatusBadge, ToolbarSearch } from "../../ui.jsx";
import { featureFlagService } from "../../services/featureFlagService.js";
import { tenantService } from "../../services/tenantService.js";
import { formatLabel, getStatusTone } from "./serviceAdminUtils.js";

const flagStatuses = ["all", "on", "off", "gradual", "guarded"];
const flagScopes = ["all", "tenant", "plan"];
const nextFlagStatuses = ["on", "off", "gradual", "guarded"];
const emptyFlag = {
  enabledTenantIds: [],
  environment: "production",
  id: "",
  key: "no-data",
  killSwitch: false,
  name: "No data",
  owner: "Service Admin",
  rollout: 0,
  scope: "tenant",
  segments: [],
  status: "off",
  variants: []
};

export function FeatureFlagWorkspace({ onAudit }) {
  const [flags, setFlags] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [scopeFilter, setScopeFilter] = useState("all");
  const [selectedFlagId, setSelectedFlagId] = useState("");
  const [nextStatus, setNextStatus] = useState("gradual");
  const [rollout, setRollout] = useState(50);
  const [selectedTenantIds, setSelectedTenantIds] = useState([]);
  const [reason, setReason] = useState("Контролируемая раскатка согласована владельцем функции");
  const [preview, setPreview] = useState(null);
  const [confirmationText, setConfirmationText] = useState("");
  const [flagOverrides, setFlagOverrides] = useState({});

  useEffect(() => {
    let cancelled = false;

    async function loadWorkspace() {
      const [flagResponse, tenantResponse] = await Promise.all([
        featureFlagService.fetchFeatureFlags(),
        tenantService.fetchTenants()
      ]);

      if (cancelled) {
        return;
      }

      const items = flagResponse.status === "ok" ? flagResponse.data?.items ?? [] : [];
      setFlags(items);
      setTenants(tenantResponse.status === "ok" ? tenantResponse.data?.items ?? [] : []);
      setSelectedFlagId(items[0]?.id ?? "");
    }

    loadWorkspace();
    return () => {
      cancelled = true;
    };
  }, []);

  const mergedFlags = useMemo(() => (
    flags.map((flag) => ({ ...flag, ...(flagOverrides[flag.id] ?? {}) }))
  ), [flagOverrides, flags]);
  const visibleFlags = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return mergedFlags.filter((flag) => {
      const statusMatches = statusFilter === "all" || flag.status === statusFilter;
      const scopeMatches = scopeFilter === "all" || flag.scope === scopeFilter;
      const queryMatches = !normalizedQuery || [flag.key, flag.name, flag.owner]
        .some((value) => String(value).toLowerCase().includes(normalizedQuery));

      return statusMatches && scopeMatches && queryMatches;
    });
  }, [mergedFlags, query, scopeFilter, statusFilter]);

  const selectedFlag = mergedFlags.find((flag) => flag.id === selectedFlagId) ?? mergedFlags[0] ?? emptyFlag;
  const currentPreview = selectedFlag.id && preview?.flag?.id === selectedFlag.id ? preview : null;
  const confirmationRequired = Boolean(currentPreview?.confirmation?.required);
  const canPreview = Boolean(selectedFlag.id && reason.trim().length >= 8);
  const canApply = Boolean(currentPreview && reason.trim().length >= 8 && (!confirmationRequired || confirmationText === currentPreview.confirmation.expectedText));

  function handleToggleTenant(tenantId) {
    setSelectedTenantIds((current) => (
      current.includes(tenantId) ? current.filter((id) => id !== tenantId) : [...current, tenantId]
    ));
    setPreview(null);
    setConfirmationText("");
  }

  async function handlePreview() {
    if (!selectedFlag.id) {
      return;
    }

    const envelope = await featureFlagService.previewFlagChange({
      flagId: selectedFlag.id,
      nextRollout: rollout,
      nextStatus,
      reason,
      tenantIds: selectedTenantIds
    });

    if (envelope.status === "ok") {
      setPreview(envelope.data);
      setConfirmationText("");
    }
  }

  async function handleApply() {
    if (!selectedFlag.id) {
      return;
    }

    const envelope = await featureFlagService.updateFeatureFlag({
      confirmationText,
      confirmed: true,
      flagId: selectedFlag.id,
      nextRollout: rollout,
      nextStatus,
      reason,
      tenantIds: selectedTenantIds
    });

    if (envelope.status === "ok" && envelope.data.applied) {
      setFlagOverrides((current) => ({ ...current, [selectedFlag.id]: envelope.data.flag }));
      setPreview(null);
      setConfirmationText("");
    }

    onAudit(envelope, { action: "feature_flag.update", target: selectedFlag.key });
  }

  return (
    <div className="service-admin-workspace-grid flag-workspace">
      <section className="service-admin-list-panel">
        <header className="service-admin-panel-toolbar">
          <ToolbarSearch
            ariaLabel="Поиск функциональных флагов"
            iconSize={17}
            onChange={setQuery}
            placeholder="Ключ или владелец"
            value={query}
          />
          <select
            aria-label="Фильтр флагов по статусу"
            className="inline-select"
            onChange={(event) => setStatusFilter(event.target.value)}
            value={statusFilter}
          >
            {flagStatuses.map((status) => <option key={status} value={status}>{formatLabel(status)}</option>)}
          </select>
          <select
            aria-label="Фильтр флагов по области"
            className="inline-select"
            onChange={(event) => setScopeFilter(event.target.value)}
            value={scopeFilter}
          >
            {flagScopes.map((scope) => <option key={scope} value={scope}>{formatLabel(scope)}</option>)}
          </select>
        </header>
        <div className="service-admin-flag-list">
          {visibleFlags.map((flag) => (
            <button
              className={flag.id === selectedFlag?.id ? "selected" : ""}
              key={flag.id}
              onClick={() => {
                setSelectedFlagId(flag.id);
                setNextStatus(flag.status);
                setRollout(flag.rollout);
                setSelectedTenantIds([]);
                setPreview(null);
                setConfirmationText("");
              }}
              type="button"
            >
              <Flag size={18} />
              <span>
                <strong>{flag.name}</strong>
                <small>{flag.key} - {flag.owner} - {flag.rollout}%</small>
              </span>
              <StatusBadge tone={getStatusTone(flag.status)}>{formatLabel(flag.status)}</StatusBadge>
            </button>
          ))}
        </div>
      </section>

      <section className="service-admin-detail-panel">
        <SectionTitle title="Управление флагом" action={selectedFlag.key} />
        <div className="service-admin-detail-head">
          <div>
            <span>{selectedFlag.owner} - {formatLabel(selectedFlag.environment)}</span>
            <h3>{selectedFlag.name}</h3>
            <p>Область: {formatLabel(selectedFlag.scope)}. Сегменты: {selectedFlag.segments.map(formatLabel).join(", ")}</p>
          </div>
          <StatusBadge tone={getStatusTone(selectedFlag.status)}>{formatLabel(selectedFlag.status)}</StatusBadge>
        </div>

        <div className="service-admin-stat-grid">
          <span><b>{selectedFlag.rollout}%</b> раскатка</span>
          <span><b>{selectedFlag.enabledTenantIds.length}</b> организаций</span>
          <span><b>{selectedFlag.killSwitch ? "да" : "нет"}</b> стоп-флаг</span>
          <span><b>{selectedFlag.variants.length}</b> вариантов</span>
        </div>

        <div className="service-admin-action-box">
          <header>
            <ShieldAlert size={18} />
            <div>
              <strong>Предпросмотр раскатки</strong>
              <span>Изменения проверяются перед аудируемым обновлением.</span>
            </div>
          </header>
          <div className="service-admin-action-grid">
            <label>
              <span>Новый статус</span>
              <select value={nextStatus} onChange={(event) => {
                setNextStatus(event.target.value);
                setPreview(null);
              }}>
                {nextFlagStatuses.map((status) => <option key={status} value={status}>{formatLabel(status)}</option>)}
              </select>
            </label>
            <label>
              <span>Раскатка: {rollout}%</span>
              <input
                max="100"
                min="0"
                onChange={(event) => {
                  setRollout(Number(event.target.value));
                  setPreview(null);
                }}
                type="range"
                value={rollout}
              />
            </label>
            <label>
              <span>Причина</span>
              <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} />
            </label>
          </div>

          <div className="service-admin-tenant-checks" aria-label="Таргетинг флага по организациям">
            {tenants.map((tenant) => (
              <label key={tenant.id}>
                <input
                  checked={selectedTenantIds.includes(tenant.id)}
                  onChange={() => handleToggleTenant(tenant.id)}
                  type="checkbox"
                />
                <span>{tenant.name}</span>
              </label>
            ))}
          </div>

          <div className="service-admin-action-buttons">
            <button disabled={!canPreview} onClick={handlePreview} type="button">
              <Eye size={17} />
              Предпросмотр
            </button>
            <button disabled={!canApply} onClick={handleApply} type="button">
              <SlidersHorizontal size={17} />
              Применить флаг
            </button>
          </div>

          {currentPreview ? (
            <div className="service-admin-preview">
              <span><b>Охват</b>{currentPreview.blastRadius} организаций</span>
              <span><b>Риск</b>{formatLabel(currentPreview.risk)}</span>
              <span><b>Статус</b>{formatLabel(currentPreview.nextStatus)}</span>
              <span><b>Раскатка</b>{currentPreview.nextRollout}%</span>
            </div>
          ) : null}

          {confirmationRequired ? (
            <label className="service-admin-reason-field">
              <span>Введите подтверждение: {currentPreview.confirmation.expectedText}</span>
              <input value={confirmationText} onChange={(event) => setConfirmationText(event.target.value)} />
            </label>
          ) : null}
        </div>
      </section>
    </div>
  );
}
