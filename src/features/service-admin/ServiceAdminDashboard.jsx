import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock3,
  CreditCard,
  DoorOpen,
  Eye,
  Flag,
  Gauge,
  RadioTower,
  RefreshCw,
  ShieldCheck,
  Siren,
  TimerReset,
  UserCog,
  Users
} from "lucide-react";
import { MetricTile, ProductScreen, SectionTitle, SegmentedControl, StatusBadge } from "../../ui.jsx";
import {
  serviceAdminFeatureFlags,
  serviceAdminAuditEvents,
  serviceAdminIncidents,
  serviceAdminPlatformComponents,
  serviceAdminSession,
  serviceAdminTenants,
  serviceAdminUsers
} from "../../data/serviceAdmin.js";
import { authService } from "../../services/authService.js";
import { platformMonitoringService } from "../../services/platformMonitoringService.js";
import { supportAdminService } from "../../services/supportAdminService.js";
import { BillingTariffWorkspace } from "./BillingTariffWorkspace.jsx";
import { FeatureFlagWorkspace } from "./FeatureFlagWorkspace.jsx";
import { IncidentMonitoringWorkspace } from "./IncidentMonitoringWorkspace.jsx";
import { ServiceAdminAuditStream } from "./ServiceAdminAuditStream.jsx";
import { ServiceUserSupportWorkspace } from "./ServiceUserSupportWorkspace.jsx";
import { TenantManagementWorkspace } from "./TenantManagementWorkspace.jsx";
import { envelopeToAuditEntry, formatTimer, getStatusTone, noop } from "./serviceAdminUtils.js";
import "./service-admin.css";

const workspaceOptions = [
  { label: "Tenants", value: "tenants" },
  { label: "Users", value: "users" },
  { label: "Billing", value: "billing" },
  { label: "Incidents", value: "incidents" },
  { label: "Flags", value: "flags" },
  { label: "Audit", value: "audit" }
];

export function ServiceAdminDashboard({ onBack = noop, onToast = noop }) {
  const [activeWorkspace, setActiveWorkspace] = useState("tenants");
  const [auditEvents, setAuditEvents] = useState(() => serviceAdminAuditEvents);
  const [feedback, setFeedback] = useState(null);
  const [impersonation, setImpersonation] = useState(null);
  const [clockTick, setClockTick] = useState(Date.now());

  const openIncidentCount = serviceAdminIncidents.filter((incident) => incident.status !== "resolved").length;
  const riskyUsers = serviceAdminUsers.filter((user) => ["high", "critical"].includes(user.risk)).length;
  const degradedComponents = serviceAdminPlatformComponents.filter((component) => component.status !== "operational").length;
  const guardedFlags = serviceAdminFeatureFlags.filter((flag) => flag.killSwitch).length;

  const remainingSeconds = useMemo(() => {
    if (!impersonation) {
      return 0;
    }

    return Math.ceil((new Date(impersonation.expiresAt).getTime() - clockTick) / 1000);
  }, [clockTick, impersonation]);

  const recordEnvelope = useCallback((envelope, fallback = {}) => {
    const entry = envelopeToAuditEntry(envelope, {
      actor: serviceAdminSession.adminName,
      ...fallback
    });

    setAuditEvents((current) => [entry, ...current]);
    setFeedback({
      id: entry.id,
      action: entry.action,
      result: entry.result,
      traceId: entry.traceId
    });
    onToast(`${entry.action}: ${entry.result} (${entry.traceId})`);
  }, [onToast]);

  const handleImpersonationStart = useCallback((envelope) => {
    setImpersonation(envelope.data.impersonation);
    recordEnvelope(envelope, { action: "impersonation.start", severity: "warn" });
  }, [recordEnvelope]);

  const handleImpersonationExit = useCallback(async () => {
    if (!impersonation) {
      return;
    }

    const envelope = await supportAdminService.stopImpersonation({
      impersonationId: impersonation.id,
      reason: "Exited from service-admin banner"
    });
    setImpersonation(null);
    recordEnvelope(envelope, { action: "impersonation.stop" });
  }, [impersonation, recordEnvelope]);

  async function handleRefreshAuthState() {
    const envelope = await authService.getAuthState();
    setFeedback({
      id: envelope.traceId,
      action: "auth.state.refresh",
      result: envelope.data.authenticated ? envelope.data.session.authState : "anonymous",
      traceId: envelope.traceId
    });
    onToast(`Auth state refreshed: ${envelope.traceId}`);
  }

  useEffect(() => {
    if (!impersonation) {
      return undefined;
    }

    const timer = window.setInterval(() => setClockTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [impersonation]);

  useEffect(() => {
    if (impersonation && remainingSeconds <= 0) {
      const expiredImpersonation = impersonation;
      setImpersonation(null);
      supportAdminService.stopImpersonation({
        impersonationId: expiredImpersonation.id,
        reason: "Expired after service-admin timer"
      }).then((envelope) => {
        recordEnvelope(envelope, { action: "impersonation.expired", severity: "warn" });
      });
    }
  }, [impersonation, recordEnvelope, remainingSeconds]);

  return (
    <ProductScreen
      title="Service admin"
      subtitle="Tenant operations, account support, billing changes, platform incidents, flags and audited privileged actions."
      onBack={onBack}
      stateItems={[
        { label: "tenants", value: serviceAdminTenants.length, tone: "ok" },
        { label: "open incidents", value: openIncidentCount, tone: openIncidentCount ? "warn" : "ok" },
        { label: "risky users", value: riskyUsers, tone: riskyUsers ? "warn" : "ok" },
        { label: "degraded components", value: degradedComponents, tone: degradedComponents ? "error" : "ok" }
      ]}
      actions={
        <>
          <select
            aria-label="Service admin workspace"
            className="inline-select"
            onChange={(event) => setActiveWorkspace(event.target.value)}
            value={activeWorkspace}
          >
            {workspaceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <button onClick={handleRefreshAuthState} type="button">
            <RefreshCw size={17} />
            Auth state
          </button>
        </>
      }
    >
      {impersonation ? (
        <ServiceAdminImpersonationBanner
          impersonation={impersonation}
          onExit={handleImpersonationExit}
          remainingSeconds={remainingSeconds}
        />
      ) : null}

      <div className="metric-strip service-admin-metrics">
        <MetricTile icon={<Building2 size={21} />} label="Tenants" value={serviceAdminTenants.length} detail="active service accounts" />
        <MetricTile icon={<Users size={21} />} label="Users" value={serviceAdminUsers.length} detail={`${riskyUsers} high-risk profiles`} tone={riskyUsers ? "danger" : ""} />
        <MetricTile icon={<Siren size={21} />} label="Incidents" value={openIncidentCount} detail="open platform events" tone={openIncidentCount ? "danger" : ""} />
        <MetricTile icon={<Flag size={21} />} label="Kill switches" value={guardedFlags} detail="feature flags guarded" />
      </div>

      <PlatformSnapshotPanel onEnvelope={recordEnvelope} />

      <section className="work-panel service-admin-workspace-shell">
        <header className="service-admin-workspace-header">
          <div>
            <SectionTitle title="Service-admin workspaces" action="privileged actions require reason and audit feedback" />
          </div>
          <SegmentedControl
            ariaLabel="Service-admin workspace tabs"
            className="service-admin-tabs"
            onChange={setActiveWorkspace}
            options={workspaceOptions}
            value={activeWorkspace}
          />
        </header>

        {feedback ? (
          <div className="service-admin-feedback" role="status">
            <CheckCircle2 size={17} />
            <span>{feedback.action}</span>
            <strong>{feedback.result}</strong>
            <code>{feedback.traceId}</code>
          </div>
        ) : null}

        {activeWorkspace === "tenants" ? <TenantManagementWorkspace onAudit={recordEnvelope} /> : null}
        {activeWorkspace === "users" ? (
          <ServiceUserSupportWorkspace
            onAudit={recordEnvelope}
            onImpersonationStart={handleImpersonationStart}
          />
        ) : null}
        {activeWorkspace === "billing" ? <BillingTariffWorkspace onAudit={recordEnvelope} /> : null}
        {activeWorkspace === "incidents" ? <IncidentMonitoringWorkspace onAudit={recordEnvelope} /> : null}
        {activeWorkspace === "flags" ? <FeatureFlagWorkspace onAudit={recordEnvelope} /> : null}
        {activeWorkspace === "audit" ? <ServiceAdminAuditStream events={auditEvents} /> : null}
      </section>
    </ProductScreen>
  );
}

function ServiceAdminImpersonationBanner({ impersonation, onExit, remainingSeconds }) {
  return (
    <section className="service-admin-impersonation" aria-live="polite">
      <TimerReset size={20} />
      <div>
        <strong>{impersonation.tenantName}</strong>
        <span>{impersonation.mode} access expires in {formatTimer(remainingSeconds)}</span>
      </div>
      <code>{impersonation.id}</code>
      <button onClick={onExit} type="button">
        <DoorOpen size={17} />
        Exit
      </button>
    </section>
  );
}

function PlatformSnapshotPanel({ onEnvelope }) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedComponentId, setSelectedComponentId] = useState(serviceAdminPlatformComponents[0].id);
  const [componentDetail, setComponentDetail] = useState(null);
  const [reason, setReason] = useState("Acknowledged from service-admin platform snapshot");
  const [confirmed, setConfirmed] = useState(false);

  const visibleComponents = useMemo(() => (
    serviceAdminPlatformComponents.filter((component) => statusFilter === "all" || component.status === statusFilter)
  ), [statusFilter]);
  const selectedComponent = serviceAdminPlatformComponents.find((component) => component.id === selectedComponentId) ?? serviceAdminPlatformComponents[0];
  const detail = componentDetail?.component?.id === selectedComponent.id ? componentDetail : {
    component: selectedComponent,
    incidents: serviceAdminIncidents.filter((incident) => incident.componentId === selectedComponent.id),
    affectedTenants: serviceAdminTenants.filter((tenant) => (
      serviceAdminIncidents.some((incident) => incident.componentId === selectedComponent.id && incident.affectedTenantIds.includes(tenant.id))
    ))
  };

  async function handleSelectComponent(componentId) {
    setSelectedComponentId(componentId);
    const envelope = await platformMonitoringService.fetchComponentDrilldown(componentId);

    if (envelope.status === "ok") {
      setComponentDetail(envelope.data);
    }
  }

  async function handleAcknowledge() {
    const envelope = await platformMonitoringService.acknowledgeComponentAlert({
      componentId: selectedComponent.id,
      confirmed,
      reason
    });

    if (envelope.status === "ok") {
      setConfirmed(false);
    }

    onEnvelope(envelope, { action: "platform.alert.acknowledge", severity: "warn" });
  }

  return (
    <section className="work-panel service-admin-platform">
      <SectionTitle title="Platform snapshot" action="component health and drilldown" />
      <div className="service-admin-platform-toolbar">
        <select
          aria-label="Filter platform components by status"
          className="inline-select"
          onChange={(event) => setStatusFilter(event.target.value)}
          value={statusFilter}
        >
          <option value="all">All statuses</option>
          <option value="operational">Operational</option>
          <option value="degraded">Degraded</option>
          <option value="partial_outage">Partial outage</option>
        </select>
        <button onClick={() => handleSelectComponent(selectedComponent.id)} type="button">
          <Eye size={17} />
          Drilldown
        </button>
      </div>

      <div className="service-admin-platform-grid">
        <div className="service-admin-component-list">
          {visibleComponents.map((component) => (
            <button
              className={component.id === selectedComponent.id ? "selected" : ""}
              key={component.id}
              onClick={() => handleSelectComponent(component.id)}
              type="button"
            >
              <Activity size={18} />
              <span>
                <strong>{component.name}</strong>
                <small>{component.ownerTeam} - {component.region}</small>
              </span>
              <StatusBadge tone={getStatusTone(component.status)}>{component.status}</StatusBadge>
            </button>
          ))}
        </div>

        <div className="service-admin-component-detail">
          <header>
            <div>
              <span>{detail.component.ownerTeam}</span>
              <h3>{detail.component.name}</h3>
            </div>
            <StatusBadge tone={getStatusTone(detail.component.status)}>{detail.component.status}</StatusBadge>
          </header>
          <div className="service-admin-signal-grid">
            <span><Gauge size={17} /> {detail.component.latencyMs} ms p95</span>
            <span><AlertTriangle size={17} /> {detail.component.errorRate}% errors</span>
            <span><ShieldCheck size={17} /> {detail.component.uptime}% uptime</span>
            <span><RadioTower size={17} /> {detail.affectedTenants.length} tenants</span>
          </div>
          <div className="service-admin-mini-list">
            {detail.component.signals.map((signal) => (
              <span className={signal.tone} key={signal.label}>
                <b>{signal.label}</b>
                {signal.value}
              </span>
            ))}
          </div>
          <label className="service-admin-reason-field">
            <span>Acknowledge reason</span>
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} />
          </label>
          <label className="service-admin-confirm">
            <input checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" />
            <span>I confirm this platform alert acknowledgement is approved and audited.</span>
          </label>
          <footer>
            <span>{detail.incidents.length} linked incidents</span>
            <button disabled={reason.trim().length < 8 || !confirmed} onClick={handleAcknowledge} type="button">
              <Clock3 size={17} />
              Acknowledge
            </button>
          </footer>
        </div>
      </div>
    </section>
  );
}
