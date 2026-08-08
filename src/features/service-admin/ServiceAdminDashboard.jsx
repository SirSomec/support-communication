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
  Bot,
  CircleHelp,
  ClipboardList,
  ShieldCheck,
  Siren,
  Settings2,
  UserCog,
  Users,
  WalletCards,
  Mail,
  Landmark,
  MessagesSquare
} from "lucide-react";
import { SectionTitle, StatusBadge } from "../../ui.jsx";
import { auditService } from "../../services/auditService.js";
import { authService } from "../../services/authService.js";
import { featureFlagService } from "../../services/featureFlagService.js";
import { incidentService } from "../../services/incidentService.js";
import { operationsService } from "../../services/operationsService.js";
import { platformMonitoringService } from "../../services/platformMonitoringService.js";
import { supportAdminService } from "../../services/supportAdminService.js";
import { tenantService } from "../../services/tenantService.js";
import { setImpersonationSession, setTenantSession } from "../../app/sessionStore.js";
import { BillingTariffWorkspace } from "./BillingTariffWorkspace.jsx";
import { FeatureFlagWorkspace } from "./FeatureFlagWorkspace.jsx";
import { IncidentMonitoringWorkspace } from "./IncidentMonitoringWorkspace.jsx";
import { ServiceAdminAuditStream } from "./ServiceAdminAuditStream.jsx";
import { ServiceUserSupportWorkspace } from "./ServiceUserSupportWorkspace.jsx";
import { TenantManagementWorkspace } from "./TenantManagementWorkspace.jsx";
import { AiConnectionsWorkspace } from "./AiConnectionsWorkspace.jsx";
import { MailSettingsWorkspace } from "./MailSettingsWorkspace.jsx";
import { SupportTicketsWorkspace } from "./SupportTicketsWorkspace.jsx";
import {
  envelopeToAuditEntry,
  formatAction,
  formatDateTime,
  formatLabel,
  formatResult,
  getStatusTone,
  noop
} from "./serviceAdminUtils.js";
import "./service-admin.css";

const workspaceOptions = [
  { label: "Обзор", value: "overview", icon: Activity, hint: "Главные показатели и задачи, которые требуют внимания." },
  { label: "Организации", value: "tenants", icon: Landmark, hint: "Управляйте компаниями, их доступом и состоянием аккаунта." },
  { label: "Пользователи", value: "users", icon: Users, hint: "Помогайте пользователям и проверяйте права доступа." },
  { label: "Тарифы и оплата — Биллинг", value: "billing", icon: WalletCards, hint: "Настраивайте тарифы и контролируйте оплату." },
  { label: "Состояние сервиса — Инциденты", value: "incidents", icon: Siren, hint: "Проверяйте неполадки, работу фоновых задач и систем." },
  { label: "Настройки функций — Флаги", value: "flags", icon: Settings2, hint: "Включайте функции постепенно и безопасно." },
  { label: "ИИ-подключения", value: "ai", icon: Bot, hint: "Настраивайте сервисы искусственного интеллекта." },
  { label: "Почта", value: "mail", icon: Mail, hint: "Настройте письма, которые сервис отправляет от своего имени." },
  { label: "Поддержка", value: "support", icon: MessagesSquare, hint: "Обрабатывайте обращения пользователей и отвечайте из единого контура сервиса." },
  { label: "Журнал действий — Аудит", value: "audit", icon: ClipboardList, hint: "Просматривайте историю важных изменений." }
];

function formatMeasuredValue(value, suffix) {
  return typeof value === "number" ? `${value} ${suffix}` : "Нет данных";
}

export function ServiceAdminDashboard({ navigationTarget = null, onBack = noop, backLabel = "Выйти", onToast = noop }) {
  const requestedWorkspace = resolveServiceAdminWorkspace(navigationTarget) || (new URLSearchParams(window.location.search).get("workspace") === "support" ? "support" : "");
  const [activeWorkspace, setActiveWorkspace] = useState(requestedWorkspace || "overview");
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
  const [loadError, setLoadError] = useState("");
  const [workerObservability, setWorkerObservability] = useState([]);

  const openIncidentCount = dashboard.openIncidentCount;
  const riskyUsers = dashboard.riskyUsers;
  const degradedComponents = dashboard.degradedComponents;
  const guardedFlags = dashboard.guardedFlags;

  useEffect(() => {
    if (requestedWorkspace && requestedWorkspace !== activeWorkspace) {
      setActiveWorkspace(requestedWorkspace);
    }
  }, [activeWorkspace, requestedWorkspace]);

  const loadDashboard = useCallback(async () => {
    setLoadError("");
    const [tenants, users, incidents, flags, platform, operations, audit] = await Promise.all([
      tenantService.fetchTenants(),
      supportAdminService.fetchSupportUsers(),
      incidentService.fetchIncidents(),
      featureFlagService.fetchFeatureFlags(),
      platformMonitoringService.fetchPlatformSnapshot(),
      operationsService.fetchReadinessDashboard({ domain: "delivery" }),
      auditService.fetchAuditEvents({ limit: 20 })
    ]);

    const responses = [tenants, users, incidents, flags, platform, operations, audit];
    const firstError = responses.find((response) => response.status !== "ok");
    if (firstError) {
      setLoadError(firstError.error?.message ?? "Не удалось загрузить данные администрирования сервиса.");
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
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

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
    recordEnvelope(envelope, { action: "impersonation.start", severity: "warn" });
    const workspaceSession = envelope.data?.tenantSession;
    if (!workspaceSession?.accessToken || !workspaceSession?.tenantId || !workspaceSession?.operator) {
      onToast("Сервер не выдал сессию рабочего места. Доступ от имени пользователя не был открыт.");
      return;
    }

    setTenantSession({
      accessToken: workspaceSession.accessToken,
      operator: workspaceSession.operator,
      tenantId: workspaceSession.tenantId
    });
    setImpersonationSession({
      expiresAt: workspaceSession.expiresAt,
      id: workspaceSession.impersonationId,
      mode: workspaceSession.mode,
      operatorName: workspaceSession.operator.name,
      tenantId: workspaceSession.tenantId,
      tenantName: envelope.data?.impersonation?.tenantName ?? workspaceSession.tenantId
    });
    window.location.assign("/#/app");
  }, [onToast, recordEnvelope]);

  async function handleRefreshAuthState() {
    const envelope = await authService.getAuthState();
    if (envelope.status !== "ok" || !envelope.data) {
      const message = envelope.error?.message ?? "Не удалось обновить состояние входа.";
      setFeedback({
        id: envelope.traceId,
        action: "auth.state.refresh",
        result: "failed",
        traceId: envelope.traceId
      });
      onToast(message);
      return;
    }
    setFeedback({
      id: envelope.traceId,
      action: "auth.state.refresh",
      result: envelope.data.authenticated ? envelope.data.session.authState : "anonymous",
      traceId: envelope.traceId
    });
    onToast(`Состояние входа обновлено: ${envelope.traceId}`);
  }

  const currentWorkspace = workspaceOptions.find((option) => option.value === activeWorkspace) ?? workspaceOptions[0];
  const attentionCount = openIncidentCount + riskyUsers + degradedComponents;

  return (
    <div className="service-admin-console">
      <aside className="service-admin-sidebar">
        <div className="service-admin-brand"><span>Support</span>com</div>
        <nav className="service-admin-tabs" aria-label="Разделы панели управления">
          {workspaceOptions.map((option) => {
            const Icon = option.icon;
            return <button className={activeWorkspace === option.value ? "selected" : ""} key={option.value} onClick={() => setActiveWorkspace(option.value)} type="button"><Icon size={19} /><span>{option.label}</span></button>;
          })}
        </nav>
        <div className="service-admin-sidebar-help"><CircleHelp size={20} /><strong>Подсказка</strong><span>{currentWorkspace.hint}</span></div>
        <button className="service-admin-logout" onClick={onBack} type="button"><DoorOpen size={17} />{backLabel}</button>
      </aside>
      <section className="service-admin-main">
        <header className="service-admin-topbar">
          <div><span className="service-admin-crumb">Панель управления</span><h1>{currentWorkspace.label}</h1></div>
          <div className="service-admin-topbar-actions">
            <button title="Проверить, что ваша сессия ещё активна" onClick={handleRefreshAuthState} type="button"><ShieldCheck size={17} />Проверить доступ</button>
            <button className="primary" title="Загрузить актуальные сведения во всех разделах" onClick={loadDashboard} type="button"><RefreshCw size={17} />Обновить</button>
          </div>
        </header>
        <div className="service-admin-content">

      {loadError ? <div className="service-admin-feedback error" role="alert">Не удалось обновить часть данных. {loadError}</div> : null}

        {feedback ? (
          <div className="service-admin-feedback" role="status">
            <CheckCircle2 size={17} />
            <span>{formatAction(feedback.action)}</span>
            <strong>{formatResult(feedback.result)}</strong>
            <code>{feedback.traceId}</code>
          </div>
        ) : null}

        {activeWorkspace === "overview" ? <ServiceAdminOverview dashboard={dashboard} attentionCount={attentionCount} onNavigate={setActiveWorkspace} workers={workerObservability} /> : null}
        {activeWorkspace === "incidents" ? <><ServiceAdminHelp title="Состояние сервиса" text="Здесь видно, всё ли работает как ожидается. Подтверждайте только те уведомления, которые уже проверили." /><PlatformSnapshotPanel onEnvelope={recordEnvelope} /><WorkerObservabilityPanel workers={workerObservability} /><IncidentMonitoringWorkspace onAudit={recordEnvelope} /></> : null}
        {activeWorkspace === "tenants" ? <TenantManagementWorkspace onAudit={recordEnvelope} /> : null}
        {activeWorkspace === "users" ? (
          <ServiceUserSupportWorkspace
            onAudit={recordEnvelope}
            onImpersonationStart={handleImpersonationStart}
          />
        ) : null}
        {activeWorkspace === "billing" ? <BillingTariffWorkspace onAudit={recordEnvelope} /> : null}
        {activeWorkspace === "flags" ? <FeatureFlagWorkspace onAudit={recordEnvelope} /> : null}
        {activeWorkspace === "ai" ? <AiConnectionsWorkspace onAudit={recordEnvelope} onToast={onToast} /> : null}
        {activeWorkspace === "mail" ? <MailSettingsWorkspace onAudit={recordEnvelope} onToast={onToast} /> : null}
        {activeWorkspace === "support" ? <SupportTicketsWorkspace onAudit={recordEnvelope} onToast={onToast} /> : null}
        {activeWorkspace === "audit" ? <ServiceAdminAuditStream events={auditEvents} /> : null}
        </div>
      </section>
    </div>
  );
}

function ServiceAdminHelp({ title, text }) {
  return <div className="service-admin-inline-help"><CircleHelp size={19} /><div><strong>{title}</strong><span>{text}</span></div></div>;
}

function ServiceAdminOverview({ dashboard, attentionCount, onNavigate, workers }) {
  const serviceIsHealthy = attentionCount === 0;
  return <>
    <section className="service-admin-intro">
      <div><h2>Панель управления сервисом</h2><p>Все важные настройки и состояние сервиса — в одном месте. Выберите раздел слева, чтобы продолжить работу.</p></div>
      <div className={`service-admin-health ${serviceIsHealthy ? "healthy" : "attention"}`}><CheckCircle2 size={26} /><div><strong>{serviceIsHealthy ? "Сервис работает стабильно" : "Есть задачи, требующие внимания"}</strong><span>{serviceIsHealthy ? "Все основные системы работают в штатном режиме" : `${attentionCount} пунктов стоит проверить в первую очередь`}</span></div><button onClick={() => onNavigate("incidents")} type="button">Открыть состояние сервиса</button></div>
    </section>
    <div className="service-admin-overview-metrics">
      <OverviewCard icon={<Building2 size={21} />} label="Организации" value={dashboard.tenantCount} detail="активных аккаунтов" onClick={() => onNavigate("tenants")} />
      <OverviewCard icon={<Users size={21} />} label="Пользователи" value={dashboard.userCount} detail="пользуются сервисом" onClick={() => onNavigate("users")} />
      <OverviewCard icon={<AlertTriangle size={21} />} label="Требуют внимания" value={attentionCount} detail="задач для проверки" tone={attentionCount ? "attention" : ""} onClick={() => onNavigate("incidents")} />
      <OverviewCard icon={<Flag size={21} />} label="Настройки функций" value={guardedFlagsLabel(dashboard.guardedFlags)} detail="функций с защитой" onClick={() => onNavigate("flags")} />
    </div>
    <section className="service-admin-overview-grid">
      <div className="service-admin-priority"><SectionTitle title="С чего начать" action="быстрые переходы" /><button onClick={() => onNavigate("incidents")} type="button"><AlertTriangle size={19} /><span><strong>Проверить состояние сервиса</strong><small>Неполадки и фоновые задачи собраны в одном разделе</small></span></button><button onClick={() => onNavigate("users")} type="button"><UserCog size={19} /><span><strong>Проверить доступ пользователей</strong><small>Помощь с учётными записями и правами</small></span></button><button onClick={() => onNavigate("audit")} type="button"><ClipboardList size={19} /><span><strong>Открыть журнал действий</strong><small>История важных изменений в сервисе</small></span></button></div>
      <ServiceAdminHelp title="Как пользоваться панелью" text="В каждом разделе есть понятное описание. Для важных изменений потребуется указать причину — это помогает команде видеть историю действий." />
    </section>
    <WorkerObservabilityPanel workers={workers} />
  </>;
}

function OverviewCard({ icon, label, value, detail, tone = "", onClick }) {
  return <button className={`service-admin-overview-card ${tone}`} onClick={onClick} type="button"><span className="service-admin-overview-icon">{icon}</span><span><small>{label}</small><strong>{value}</strong><em>{detail}</em></span></button>;
}

function guardedFlagsLabel(value) { return typeof value === "number" ? value : "—"; }

function resolveServiceAdminWorkspace(navigationTarget) {
  const workspace = typeof navigationTarget?.workspace === "string" ? navigationTarget.workspace : "";
  return workspaceOptions.some((option) => option.value === workspace) ? workspace : "";
}

function WorkerObservabilityPanel({ workers = [] }) {
  const blockedCount = workers.filter((worker) => worker.health?.status === "blocked").length;
  const queuedCount = workers.reduce((total, worker) => total + Number(worker.queueDepth ?? 0), 0);

  return (
    <section className="work-panel service-admin-worker-observability" data-testid="service-admin-worker-observability">
      <SectionTitle title="Очереди фоновых задач" action={`${blockedCount} заблокировано / ${queuedCount} в очереди`} />
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
                <span><Gauge size={17} /> {worker.queueDepth ?? 0} в очереди</span>
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
                  <span>нет событий</span>
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="service-admin-empty">
          <strong>Нет данных о фоновых задачах</strong>
          <span>Журнал доставки пока не содержит событий фоновых задач.</span>
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
            <span><Gauge size={17} /> {formatMeasuredValue(detail.component.latencyMs, "мс p95")}</span>
            <span><AlertTriangle size={17} /> {formatMeasuredValue(detail.component.errorRate, "% ошибок")}</span>
            <span><ShieldCheck size={17} /> {formatMeasuredValue(detail.component.uptime, "% аптайм")}</span>
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
