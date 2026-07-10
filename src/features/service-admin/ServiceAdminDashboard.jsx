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
import { auditService } from "../../services/auditService.js";
import { authService } from "../../services/authService.js";
import { featureFlagService } from "../../services/featureFlagService.js";
import { incidentService } from "../../services/incidentService.js";
import { operationsService } from "../../services/operationsService.js";
import { platformMonitoringService } from "../../services/platformMonitoringService.js";
import { supportAdminService } from "../../services/supportAdminService.js";
import { tenantService } from "../../services/tenantService.js";
import { BillingTariffWorkspace } from "./BillingTariffWorkspace.jsx";
import { FeatureFlagWorkspace } from "./FeatureFlagWorkspace.jsx";
import { IncidentMonitoringWorkspace } from "./IncidentMonitoringWorkspace.jsx";
import { ServiceAdminAuditStream } from "./ServiceAdminAuditStream.jsx";
import { ServiceUserSupportWorkspace } from "./ServiceUserSupportWorkspace.jsx";
import { TenantManagementWorkspace } from "./TenantManagementWorkspace.jsx";
import {
  envelopeToAuditEntry,
  formatAction,
  formatDateTime,
  formatLabel,
  formatResult,
  formatTimer,
  getStatusTone,
  noop
} from "./serviceAdminUtils.js";
import "./service-admin.css";

const workspaceOptions = [
  { label: "Организации", value: "tenants" },
  { label: "Пользователи", value: "users" },
  { label: "Биллинг", value: "billing" },
  { label: "Инциденты", value: "incidents" },
  { label: "Флаги", value: "flags" },
  { label: "Аудит", value: "audit" }
];

export function ServiceAdminDashboard({ navigationTarget = null, onBack = noop, onToast = noop }) {
  const requestedWorkspace = resolveServiceAdminWorkspace(navigationTarget);
  const [activeWorkspace, setActiveWorkspace] = useState(requestedWorkspace || "tenants");
  const [auditEvents, setAuditEvents] = useState([]);
  const [dashboard, setDashboard] = useState({
    degradedComponents: 0,
    guardedFlags: 0,
    openIncidentCount: 0,
    riskyUsers: 0,
    tenantCount: 0,
    userCount: 0
  });
  const [feedback, setFeedback] = useState(null);
  const [impersonation, setImpersonation] = useState(null);
  const [workerObservability, setWorkerObservability] = useState([]);
  const [clockTick, setClockTick] = useState(Date.now());

  const openIncidentCount = dashboard.openIncidentCount;
  const riskyUsers = dashboard.riskyUsers;
  const degradedComponents = dashboard.degradedComponents;
  const guardedFlags = dashboard.guardedFlags;

  useEffect(() => {
    if (requestedWorkspace && requestedWorkspace !== activeWorkspace) {
      setActiveWorkspace(requestedWorkspace);
    }
  }, [activeWorkspace, requestedWorkspace]);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      const [tenants, users, incidents, flags, platform, operations, audit] = await Promise.all([
        tenantService.fetchTenants(),
        supportAdminService.fetchSupportUsers(),
        incidentService.fetchIncidents(),
        featureFlagService.fetchFeatureFlags(),
        platformMonitoringService.fetchPlatformSnapshot(),
        operationsService.fetchReadinessDashboard({ domain: "delivery" }),
        auditService.fetchAuditEvents({ limit: 20 })
      ]);

      if (cancelled) {
        return;
      }

      const tenantItems = tenants.status === "ok" ? tenants.data?.items ?? [] : [];
      const userItems = users.status === "ok" ? users.data?.items ?? [] : [];
      const incidentItems = incidents.status === "ok" ? incidents.data?.items ?? [] : [];
      const flagItems = flags.status === "ok" ? flags.data?.items ?? [] : [];
      const components = platform.status === "ok" ? platform.data?.components ?? [] : [];
      const workers = operations.status === "ok" ? operations.data?.workerObservability ?? [] : [];
      const auditItems = audit.status === "ok" ? audit.data?.items ?? [] : [];

      setDashboard({
        degradedComponents: components.filter((component) => component.status !== "operational").length,
        guardedFlags: flagItems.filter((flag) => flag.killSwitch).length,
        openIncidentCount: incidentItems.filter((incident) => incident.status !== "resolved").length,
        riskyUsers: userItems.filter((user) => ["high", "critical"].includes(user.risk)).length,
        tenantCount: tenantItems.length,
        userCount: userItems.length
      });
      setWorkerObservability(workers);
      setAuditEvents(auditItems.map((event) => ({
        id: event.id,
        action: event.action,
        actor: event.actorName ?? event.actor,
        at: event.at,
        reason: event.reason,
        result: event.result,
        severity: event.severity === "critical" ? "critical" : event.severity === "warning" ? "warn" : "info",
        target: event.target,
        traceId: event.traceId
      })));
    }

    loadDashboard();
    return () => {
      cancelled = true;
    };
  }, []);

  const remainingSeconds = useMemo(() => {
    if (!impersonation) {
      return 0;
    }

    return Math.ceil((new Date(impersonation.expiresAt).getTime() - clockTick) / 1000);
  }, [clockTick, impersonation]);

  const recordEnvelope = useCallback((envelope, fallback = {}) => {
    const entry = envelopeToAuditEntry(envelope, {
      actor: "Service Admin",
      ...fallback
    });

    setAuditEvents((current) => [entry, ...current]);
    setFeedback({
      id: entry.id,
      action: entry.action,
      result: entry.result,
      traceId: entry.traceId
    });
    onToast(`${formatAction(entry.action)}: ${formatResult(entry.result)} (${entry.traceId})`);
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
      reason: "Выход из режима доступа администратора сервиса"
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
    onToast(`Состояние входа обновлено: ${envelope.traceId}`);
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
        reason: "Время доступа администратора сервиса истекло"
      }).then((envelope) => {
        recordEnvelope(envelope, { action: "impersonation.expired", severity: "warn" });
      });
    }
  }, [impersonation, recordEnvelope, remainingSeconds]);

  return (
    <ProductScreen
      title="Администрирование сервиса"
      subtitle="Операции с организациями, поддержка учетных записей, биллинг, инциденты платформы, флаги и аудит привилегированных действий."
      onBack={onBack}
      stateItems={[
        { label: "организации", value: dashboard.tenantCount, tone: "ok" },
        { label: "открытые инциденты", value: openIncidentCount, tone: openIncidentCount ? "warn" : "ok" },
        { label: "рисковые пользователи", value: riskyUsers, tone: riskyUsers ? "warn" : "ok" },
        { label: "деградации компонентов", value: degradedComponents, tone: degradedComponents ? "error" : "ok" }
      ]}
      actions={
        <>
          <select
            aria-label="Рабочая зона администратора сервиса"
            className="inline-select"
            onChange={(event) => setActiveWorkspace(event.target.value)}
            value={activeWorkspace}
          >
            {workspaceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <button onClick={handleRefreshAuthState} type="button">
            <RefreshCw size={17} />
            Состояние входа
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
        <MetricTile icon={<Building2 size={21} />} label="Организации" value={dashboard.tenantCount} detail="активные аккаунты сервиса" />
        <MetricTile icon={<Users size={21} />} label="Пользователи" value={dashboard.userCount} detail={`${riskyUsers} профиля с высоким риском`} tone={riskyUsers ? "danger" : ""} />
        <MetricTile icon={<Siren size={21} />} label="Инциденты" value={openIncidentCount} detail="открытые события платформы" tone={openIncidentCount ? "danger" : ""} />
        <MetricTile icon={<Flag size={21} />} label="Стоп-флаги" value={guardedFlags} detail="флаги с защитным выключателем" />
      </div>

      <PlatformSnapshotPanel onEnvelope={recordEnvelope} />
      <WorkerObservabilityPanel workers={workerObservability} />

      <section className="work-panel service-admin-workspace-shell">
        <header className="service-admin-workspace-header">
          <div>
            <SectionTitle title="Рабочие зоны администратора сервиса" action="привилегированные действия требуют причины и аудита" />
          </div>
          <SegmentedControl
            ariaLabel="Вкладки администратора сервиса"
            className="service-admin-tabs"
            onChange={setActiveWorkspace}
            options={workspaceOptions}
            value={activeWorkspace}
          />
        </header>

        {feedback ? (
          <div className="service-admin-feedback" role="status">
            <CheckCircle2 size={17} />
            <span>{formatAction(feedback.action)}</span>
            <strong>{formatResult(feedback.result)}</strong>
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

function resolveServiceAdminWorkspace(navigationTarget) {
  const workspace = typeof navigationTarget?.workspace === "string" ? navigationTarget.workspace : "";
  return workspaceOptions.some((option) => option.value === workspace) ? workspace : "";
}

function ServiceAdminImpersonationBanner({ impersonation, onExit, remainingSeconds }) {
  return (
    <section className="service-admin-impersonation" aria-live="polite">
      <TimerReset size={20} />
      <div>
        <strong>{impersonation.tenantName}</strong>
        <span>{formatLabel(impersonation.mode)} - доступ истечет через {formatTimer(remainingSeconds)}</span>
      </div>
      <code>{impersonation.id}</code>
      <button onClick={onExit} type="button">
        <DoorOpen size={17} />
        Выйти
      </button>
    </section>
  );
}

function WorkerObservabilityPanel({ workers = [] }) {
  const blockedCount = workers.filter((worker) => worker.health?.status === "blocked").length;
  const queuedCount = workers.reduce((total, worker) => total + Number(worker.queueDepth ?? 0), 0);

  return (
    <section className="work-panel service-admin-worker-observability" data-testid="service-admin-worker-observability">
      <SectionTitle title="РћС‡РµСЂРµРґРё runtime worker" action={`${blockedCount} Р±Р»РѕРєРёСЂСѓСЋС‰РёС… / ${queuedCount} РІ РѕС‡РµСЂРµРґРё`} />
      {workers.length ? (
        <div className="service-admin-worker-grid">
          {workers.map((worker) => (
            <article className={`service-admin-worker-row ${worker.health?.status ?? "unknown"}`} key={worker.workerId}>
              <header>
                <RadioTower size={18} />
                <span>
                  <strong>{worker.workerId}</strong>
                  <small>{worker.queue}</small>
                </span>
                <StatusBadge tone={getStatusTone(worker.health?.status)}>{formatLabel(worker.health?.status)}</StatusBadge>
              </header>
              <div className="service-admin-signal-grid">
                <span><Gauge size={17} /> {worker.queueDepth ?? 0} РІ РѕС‡РµСЂРµРґРё</span>
                <span><AlertTriangle size={17} /> {worker.deadLetterCount ?? 0} dead letters</span>
                <span><Clock3 size={17} /> {formatDateTime(worker.updatedAt)}</span>
                <span><ShieldCheck size={17} /> {worker.evidenceSource}</span>
              </div>
              {worker.lastDelivery ? (
                <div className="service-admin-worker-delivery">
                  <span>{worker.lastDelivery.eventType}</span>
                  <span>{worker.lastDelivery.deliveryId}</span>
                  <strong>{formatLabel(worker.lastDelivery.status)}</strong>
                  <code>{worker.lastDelivery.traceId}</code>
                </div>
              ) : (
                <div className="service-admin-worker-delivery empty">
                  <span>РЅРµС‚ СЃРѕР±С‹С‚РёР№</span>
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="service-admin-empty">
          <strong>РќРµС‚ runtime evidence</strong>
          <span>Durable delivery journal РїРѕРєР° РЅРµ СЃРѕРґРµСЂР¶РёС‚ worker-СЃРѕР±С‹С‚РёР№.</span>
        </div>
      )}
    </section>
  );
}

function PlatformSnapshotPanel({ onEnvelope }) {
  const [components, setComponents] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedComponentId, setSelectedComponentId] = useState("");
  const [componentDetail, setComponentDetail] = useState(null);
  const [reason, setReason] = useState("Подтверждение из панели состояния платформы");
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadPlatform() {
      const [platform, incidentResponse, tenantResponse] = await Promise.all([
        platformMonitoringService.fetchPlatformSnapshot(),
        incidentService.fetchIncidents(),
        tenantService.fetchTenants()
      ]);

      if (cancelled) {
        return;
      }

      const nextComponents = platform.status === "ok" ? platform.data?.components ?? [] : [];
      setComponents(nextComponents);
      setIncidents(incidentResponse.status === "ok" ? incidentResponse.data?.items ?? [] : []);
      setTenants(tenantResponse.status === "ok" ? tenantResponse.data?.items ?? [] : []);
      setSelectedComponentId(nextComponents[0]?.id ?? "");
    }

    loadPlatform();
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleComponents = useMemo(() => (
    components.filter((component) => statusFilter === "all" || component.status === statusFilter)
  ), [components, statusFilter]);
  const selectedComponent = visibleComponents.find((component) => component.id === selectedComponentId)
    ?? visibleComponents[0]
    ?? components.find((component) => component.id === selectedComponentId)
    ?? components[0]
    ?? null;
  const detail = selectedComponent ? (
    componentDetail?.component?.id === selectedComponent.id ? componentDetail : {
      component: selectedComponent,
      incidents: incidents.filter((incident) => incident.componentId === selectedComponent.id),
      affectedTenants: tenants.filter((tenant) => (
        incidents.some((incident) => incident.componentId === selectedComponent.id && incident.affectedTenantIds?.includes(tenant.id))
      ))
    }
  ) : null;

  async function handleSelectComponent(componentId) {
    if (!componentId) {
      return;
    }

    setSelectedComponentId(componentId);
    const envelope = await platformMonitoringService.fetchComponentDrilldown(componentId);

    if (envelope.status === "ok") {
      setComponentDetail(envelope.data);
    }
  }

  async function handleAcknowledge() {
    if (!selectedComponent) {
      return;
    }

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
      <SectionTitle title="Состояние платформы" action="здоровье компонентов и детализация" />
      <div className="service-admin-platform-toolbar">
        <select
          aria-label="Фильтр компонентов платформы по статусу"
          className="inline-select"
          onChange={(event) => setStatusFilter(event.target.value)}
          value={statusFilter}
        >
          <option value="all">Все статусы</option>
          <option value="operational">Работает</option>
          <option value="degraded">Деградация</option>
          <option value="partial_outage">Частичный сбой</option>
        </select>
        <button disabled={!selectedComponent} onClick={() => handleSelectComponent(selectedComponent?.id)} type="button">
          <Eye size={17} />
          Детали
        </button>
      </div>

      <div className="service-admin-platform-grid">
        <div className="service-admin-component-list">
          {visibleComponents.map((component) => (
            <button
              className={component.id === selectedComponent?.id ? "selected" : ""}
              key={component.id}
              onClick={() => handleSelectComponent(component.id)}
              type="button"
            >
              <Activity size={18} />
              <span>
                <strong>{component.name}</strong>
                <small>{component.ownerTeam} - {component.region}</small>
              </span>
              <StatusBadge tone={getStatusTone(component.status)}>{formatLabel(component.status)}</StatusBadge>
            </button>
          ))}
        </div>

        {detail ? (
          <div className="service-admin-component-detail">
          <header>
            <div>
              <span>{detail.component.ownerTeam}</span>
              <h3>{detail.component.name}</h3>
            </div>
            <StatusBadge tone={getStatusTone(detail.component.status)}>{formatLabel(detail.component.status)}</StatusBadge>
          </header>
          <div className="service-admin-signal-grid">
            <span><Gauge size={17} /> {detail.component.latencyMs} мс p95</span>
            <span><AlertTriangle size={17} /> {detail.component.errorRate}% ошибок</span>
            <span><ShieldCheck size={17} /> {detail.component.uptime}% аптайм</span>
            <span><RadioTower size={17} /> {detail.affectedTenants.length} организаций</span>
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
            <span>Причина подтверждения</span>
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} />
          </label>
          <label className="service-admin-confirm">
            <input checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" />
            <span>Подтверждаю, что алерт платформы согласован и будет записан в аудит.</span>
          </label>
          <footer>
            <span>{detail.incidents.length} связанных инцидентов</span>
            <button disabled={reason.trim().length < 8 || !confirmed} onClick={handleAcknowledge} type="button">
              <Clock3 size={17} />
              Подтвердить
            </button>
          </footer>
          </div>
        ) : (
          <div className="service-admin-component-detail">
            <div className="service-admin-empty">
              <strong>Нет компонентов платформы</strong>
              <span>Данные мониторинга еще не загружены или недоступны.</span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
