import React, { useMemo, useState } from "react";
import { Eye, Flag, ShieldAlert, SlidersHorizontal } from "lucide-react";
import { SectionTitle, StatusBadge, ToolbarSearch } from "../../ui.jsx";
import { serviceAdminFeatureFlags, serviceAdminTenants } from "../../data/serviceAdmin.js";
import { featureFlagService } from "../../services/featureFlagService.js";
import { getStatusTone } from "./serviceAdminUtils.js";

const flagStatuses = ["all", "on", "off", "gradual", "guarded"];
const flagScopes = ["all", "tenant", "plan"];
const nextFlagStatuses = ["on", "off", "gradual", "guarded"];

export function FeatureFlagWorkspace({ onAudit }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [scopeFilter, setScopeFilter] = useState("all");
  const [selectedFlagId, setSelectedFlagId] = useState(serviceAdminFeatureFlags[0].id);
  const [nextStatus, setNextStatus] = useState("gradual");
  const [rollout, setRollout] = useState(50);
  const [selectedTenantIds, setSelectedTenantIds] = useState([]);
  const [reason, setReason] = useState("Controlled rollout requested by feature owner");
  const [preview, setPreview] = useState(null);
  const [confirmationText, setConfirmationText] = useState("");
  const [flagOverrides, setFlagOverrides] = useState({});

  const flags = useMemo(() => (
    serviceAdminFeatureFlags.map((flag) => ({ ...flag, ...(flagOverrides[flag.id] ?? {}) }))
  ), [flagOverrides]);
  const visibleFlags = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return flags.filter((flag) => {
      const statusMatches = statusFilter === "all" || flag.status === statusFilter;
      const scopeMatches = scopeFilter === "all" || flag.scope === scopeFilter;
      const queryMatches = !normalizedQuery || [flag.key, flag.name, flag.owner]
        .some((value) => String(value).toLowerCase().includes(normalizedQuery));

      return statusMatches && scopeMatches && queryMatches;
    });
  }, [flags, query, scopeFilter, statusFilter]);

  const selectedFlag = flags.find((flag) => flag.id === selectedFlagId) ?? flags[0];
  const currentPreview = preview?.flag?.id === selectedFlag.id ? preview : null;
  const confirmationRequired = Boolean(currentPreview?.confirmation?.required);
  const canApply = currentPreview && reason.trim().length >= 8 && (!confirmationRequired || confirmationText === currentPreview.confirmation.expectedText);

  function handleToggleTenant(tenantId) {
    setSelectedTenantIds((current) => (
      current.includes(tenantId) ? current.filter((id) => id !== tenantId) : [...current, tenantId]
    ));
    setPreview(null);
    setConfirmationText("");
  }

  async function handlePreview() {
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
            ariaLabel="Search feature flags"
            iconSize={17}
            onChange={setQuery}
            placeholder="Search key, owner"
            value={query}
          />
          <select
            aria-label="Flag status filter"
            className="inline-select"
            onChange={(event) => setStatusFilter(event.target.value)}
            value={statusFilter}
          >
            {flagStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
          <select
            aria-label="Flag scope filter"
            className="inline-select"
            onChange={(event) => setScopeFilter(event.target.value)}
            value={scopeFilter}
          >
            {flagScopes.map((scope) => <option key={scope} value={scope}>{scope}</option>)}
          </select>
        </header>
        <div className="service-admin-flag-list">
          {visibleFlags.map((flag) => (
            <button
              className={flag.id === selectedFlag.id ? "selected" : ""}
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
              <StatusBadge tone={getStatusTone(flag.status)}>{flag.status}</StatusBadge>
            </button>
          ))}
        </div>
      </section>

      <section className="service-admin-detail-panel">
        <SectionTitle title="Feature flag control" action={selectedFlag.key} />
        <div className="service-admin-detail-head">
          <div>
            <span>{selectedFlag.owner} - {selectedFlag.environment}</span>
            <h3>{selectedFlag.name}</h3>
            <p>{selectedFlag.scope} scoped rollout across {selectedFlag.segments.join(", ")}</p>
          </div>
          <StatusBadge tone={getStatusTone(selectedFlag.status)}>{selectedFlag.status}</StatusBadge>
        </div>

        <div className="service-admin-stat-grid">
          <span><b>{selectedFlag.rollout}%</b> rollout</span>
          <span><b>{selectedFlag.enabledTenantIds.length}</b> tenants</span>
          <span><b>{selectedFlag.killSwitch ? "yes" : "no"}</b> kill switch</span>
          <span><b>{selectedFlag.variants.length}</b> variants</span>
        </div>

        <div className="service-admin-action-box">
          <header>
            <ShieldAlert size={18} />
            <div>
              <strong>Rollout preview</strong>
              <span>Changes are previewed before an audited update.</span>
            </div>
          </header>
          <div className="service-admin-action-grid">
            <label>
              <span>Next status</span>
              <select value={nextStatus} onChange={(event) => {
                setNextStatus(event.target.value);
                setPreview(null);
              }}>
                {nextFlagStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </label>
            <label>
              <span>Rollout: {rollout}%</span>
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
              <span>Reason</span>
              <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} />
            </label>
          </div>

          <div className="service-admin-tenant-checks" aria-label="Tenant flag targeting">
            {serviceAdminTenants.map((tenant) => (
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
            <button disabled={reason.trim().length < 8} onClick={handlePreview} type="button">
              <Eye size={17} />
              Preview
            </button>
            <button disabled={!canApply} onClick={handleApply} type="button">
              <SlidersHorizontal size={17} />
              Apply flag
            </button>
          </div>

          {currentPreview ? (
            <div className="service-admin-preview">
              <span><b>Blast radius</b>{currentPreview.blastRadius} tenants</span>
              <span><b>Risk</b>{currentPreview.risk}</span>
              <span><b>Status</b>{currentPreview.nextStatus}</span>
              <span><b>Rollout</b>{currentPreview.nextRollout}%</span>
            </div>
          ) : null}

          {confirmationRequired ? (
            <label className="service-admin-reason-field">
              <span>Type confirmation: {currentPreview.confirmation.expectedText}</span>
              <input value={confirmationText} onChange={(event) => setConfirmationText(event.target.value)} />
            </label>
          ) : null}
        </div>
      </section>
    </div>
  );
}
