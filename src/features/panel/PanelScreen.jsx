import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CircleHelp,
  Clock3,
  Inbox,
  RefreshCw,
  UsersRound,
  Workflow
} from "lucide-react";
import {
  PRESENCE_STATUSES,
  PRESENCE_STATUS_NOT_SET_LABEL,
  formatPresenceDuration,
  formatPresenceSeconds,
  presenceStatusClass,
  presenceStatusLabel
} from "../../app/presenceModel.js";
import { submitRoutingRedistribution } from "../../app/routingActions.js";
import { routingService } from "../../services/routingService.js";
import { ChannelBadge, ChannelList, MetricTile, Modal, ProductScreen, ScreenStateStrip, WorkspaceState } from "../../ui.jsx";
import { OperatorAvatar } from "../operators/OperatorAvatar.jsx";
import { ShiftManagerModal } from "./ShiftManagerModal.jsx";
import {
  PANEL_AUTO_REFRESH_MS,
  PANEL_WORKLOAD_PERIODS,
  currentLocalDateValue,
  formatPanelDate,
  formatPanelDateTime,
  formatPanelTime,
  formatRefreshTime,
  isSelectablePresenceDate,
  resolveShiftSummary,
  shiftTimeLabel,
  workloadPeriodLabel
} from "./panelModel.js";
import { usePanelWorkspace } from "./usePanelWorkspace.js";

export function PanelScreen({ onBack, onToast, access = {}, navigationTarget = null, presenceVersion = 0 }) {
  const [channel, setChannel] = useState("Все каналы");
  const [workloadPeriod, setWorkloadPeriod] = useState("live");
  const [presenceDate, setPresenceDate] = useState(() => currentLocalDateValue());
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [redistributionBusy, setRedistributionBusy] = useState(false);
  const [redistributionPayload, setRedistributionPayload] = useState(null);
  const [redistributionPreview, setRedistributionPreview] = useState(null);
  const [redistributionHelpOpen, setRedistributionHelpOpen] = useState(false);
  const [shiftManagerOpen, setShiftManagerOpen] = useState(false);
  const workspace = usePanelWorkspace({ channel, presenceDate, presenceVersion, workloadPeriod });
  const todayPresenceDate = currentLocalDateValue(new Date(nowMs));

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 10_000);
    return () => window.clearInterval(timer);
  }, []);

  const workload = workspace.workload ?? {};
  const queues = Array.isArray(workload.queues) ? workload.queues : [];
  const allOperators = Array.isArray(workload.operators) ? workload.operators : [];
  const totals = workload.totals ?? {};
  const teamPresenceOperators = Array.isArray(workspace.presence?.operators) ? workspace.presence.operators : [];
  const teamPresenceByOperator = useMemo(
    () => new Map(teamPresenceOperators.map((row) => [String(row.operatorId), row])),
    [teamPresenceOperators]
  );
  const shiftIsActive = isShiftActive(workspace.shift, nowMs);
  const activeShift = shiftIsActive ? workspace.shift : null;
  const shiftSummary = useMemo(() => resolveShiftSummary(activeShift, allOperators), [activeShift, allOperators]);
  const displayOperators = shiftSummary.configured ? shiftSummary.members : allOperators;
  const displayPresenceOperators = shiftSummary.configured
    ? teamPresenceOperators.filter((row) => new Set(activeShift.operatorIds.map(String)).has(String(row.operatorId)))
    : teamPresenceOperators;
  const activeChats = Number(totals.activeChats ?? queues.reduce((sum, queue) => sum + Number(queue.active ?? 0), 0));
  const waitingChats = Number(totals.waitingChats ?? queues.reduce((sum, queue) => sum + Number(queue.waiting ?? 0), 0));
  const overdueChats = Number(totals.overdueChats ?? queues.reduce((sum, queue) => sum + Number(queue.overdue ?? 0), 0));
  const panelNotificationContext = resolvePanelNotificationContext(navigationTarget, overdueChats);
  const selectedQueuesForRedistribution = resolveRedistributionQueues(queues);
  const canRedistribute = Boolean(access.canRedistribute) && selectedQueuesForRedistribution.length > 0 && !redistributionBusy;
  const canManageShift = Boolean(access.canRedistribute);
  const workloadLabel = workloadPeriodLabel(workloadPeriod, workload.workloadPeriod);
  const channelOptions = [
    { label: "Все очереди", value: "Все каналы" },
    ...queues.map((queue) => ({ label: queue.name ?? queue.channel, value: queue.channel }))
  ];

  async function openRedistributionPreview() {
    if (!access.canRedistribute) {
      onToast?.(access.reason ?? "Недостаточно прав для перераспределения.");
      return;
    }
    if (!selectedQueuesForRedistribution.length) {
      onToast?.("В выбранных очередях нет диалогов, ожидающих ответа.");
      return;
    }

    const requestPayload = {
      idempotencyKey: createRedistributionKey(channel),
      reason: "Перераспределение очереди из панели смены",
      selectedQueues: selectedQueuesForRedistribution,
      targetRule: "least_loaded"
    };
    setRedistributionBusy(true);
    try {
      const response = await routingService.previewRedistribution(requestPayload);
      if (response.status !== "ok") {
        onToast?.(response.error?.message ?? "Не удалось подготовить перераспределение.");
        return;
      }
      setRedistributionPayload({ ...requestPayload, previewId: response.data?.redistributionId });
      setRedistributionPreview(response.data ?? null);
    } finally {
      setRedistributionBusy(false);
    }
  }

  async function confirmRedistribution() {
    if (!redistributionPayload) return;
    setRedistributionBusy(true);
    try {
      const result = await submitRoutingRedistribution(redistributionPayload);
      if (!result.ok) {
        onToast?.(result.message);
        return;
      }
      closeRedistributionPreview();
      workspace.refresh();
      onToast?.(`Перераспределение применено: ${result.appliedCount} назначений.`);
    } finally {
      setRedistributionBusy(false);
    }
  }

  function closeRedistributionPreview() {
    setRedistributionPreview(null);
    setRedistributionPayload(null);
  }

  function changePresenceDate(value) {
    if (isSelectablePresenceDate(value, new Date(nowMs))) {
      setPresenceDate(value);
      return;
    }
    if (!value) {
      setPresenceDate(todayPresenceDate);
    }
  }

  if (workspace.loading && !workspace.workload) {
    return (
      <ProductScreen title="Панель смены" subtitle="Загружаем живую картину очередей и команды…" onBack={onBack}>
        <ScreenStateStrip items={[{ label: "Панель", tone: "loading", value: "обновляем данные" }]} />
      </ProductScreen>
    );
  }

  if (workspace.error && !workspace.workload) {
    return (
      <ProductScreen title="Панель смены" subtitle="Данные панели сейчас недоступны." onBack={onBack}>
        <WorkspaceState actionLabel="Повторить" description={workspace.error} onAction={workspace.refresh} title="Не удалось загрузить нагрузку" tone="error" />
      </ProductScreen>
    );
  }

  return (
    <ProductScreen
      title="Панель смены"
      subtitle="Состав смены, текущие очереди и нагрузка обновляются автоматически без перезагрузки страницы."
      onBack={onBack}
      actions={
        <PanelLiveStatus
          nowMs={nowMs}
          offline={!workspace.online}
          onRefresh={workspace.refresh}
          refreshing={workspace.refreshing}
          stale={workspace.stale}
          updatedAt={workload.refreshedAt ?? workspace.receivedAt}
        />
      }
    >
      <section className="panel-command-bar" aria-label="Управление панелью смены">
        <label className="panel-command-control">
          <span>Очереди</span>
          <select aria-label="Очереди на панели" onChange={(event) => setChannel(event.target.value)} value={channel}>
            {channelOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <div className="panel-command-control panel-shift-command">
          <span>Смена</span>
          <strong>{shiftIsActive ? `${workspace.shift?.name ?? "Смена"} · ${shiftTimeLabel(workspace.shift)}` : shiftCommandLabel(workspace.shift)}</strong>
          <button
            disabled={!canManageShift}
            onClick={() => setShiftManagerOpen(true)}
            title={canManageShift ? "Задать состав и время текущей смены" : access.reason}
            type="button"
          >
            Управлять сменой
          </button>
        </div>
        <label className="panel-command-control">
          <span>Период нагрузки</span>
          <select aria-label="Период нагрузки операторов" onChange={(event) => setWorkloadPeriod(event.target.value)} value={workloadPeriod}>
            {PANEL_WORKLOAD_PERIODS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <div className="panel-command-actions">
          <button className="panel-help-action" onClick={() => setRedistributionHelpOpen(true)} type="button">
            <CircleHelp aria-hidden="true" size={17} /> Что будет сделано?
          </button>
          <button
            className="primary-action"
            disabled={!canRedistribute}
            onClick={() => void openRedistributionPreview()}
            title={canRedistribute ? "Сначала показать план перераспределения" : redistributionUnavailableReason(access, selectedQueuesForRedistribution, redistributionBusy)}
            type="button"
          >
            <Workflow aria-hidden="true" size={17} />
            {redistributionBusy ? "Готовим план…" : "Перераспределить"}
          </button>
        </div>
      </section>

      {!shiftIsActive ? (
        <section className="panel-shift-callout" aria-live="polite">
          <UsersRound aria-hidden="true" size={20} />
          <div>
            <strong>{workspace.errors.shift ? "Состав смены временно недоступен" : "Смена пока не определена"}</strong>
            <span>{workspace.errors.shift || "Задайте время и состав — тогда показатель «В смене» будет отражать именно эту команду."}</span>
          </div>
          {canManageShift ? <button onClick={() => setShiftManagerOpen(true)} type="button">Определить смену</button> : null}
        </section>
      ) : (
        <section className="shift-summary-strip" aria-label="Сводка текущей смены">
          <ShiftSummaryItem label="В смене" value={`${shiftSummary.memberCount}`} detail={workspace.shift?.name ?? "Текущая смена"} />
          <ShiftSummaryItem label="На линии" value={`${shiftSummary.onLineCount}`} detail="онлайн, занят или завершает" tone="healthy" />
          <ShiftSummaryItem label="Перерыв" value={`${shiftSummary.breakCount}`} detail="в составе смены" tone="warning" />
          <ShiftSummaryItem label="Интервал" value={shiftTimeLabel(workspace.shift)} detail="локальное время" />
        </section>
      )}

      {panelNotificationContext ? (
        <section className="work-panel panel-notification-context" data-testid="panel-notification-context">
          <div>
            <strong>{panelNotificationContext.title}</strong>
            <span>{panelNotificationContext.detail}</span>
          </div>
          <b>{panelNotificationContext.badge}</b>
        </section>
      ) : null}

      {workspace.errors.presence || workspace.errors.shift ? (
        <section className="panel-inline-warning" role="status">
          <AlertTriangle aria-hidden="true" size={17} />
          <span>{workspace.errors.presence || workspace.errors.shift} Сохраняем последний успешный снимок и повторим запрос автоматически.</span>
        </section>
      ) : null}

      <div className={`metric-strip panel-metric-strip ${panelNotificationContext?.focus === "sla" ? "sla-focused" : ""}`}>
        <MetricTile
          icon={<UsersRound size={21} />}
          label="В смене"
          value={shiftIsActive ? `${shiftSummary.onLineCount} / ${shiftSummary.memberCount}` : "—"}
          detail={shiftIsActive ? "на линии / состав" : "состав не задан"}
        />
        <MetricTile icon={<Inbox size={21} />} label="Активные диалоги" value={activeChats} detail="снимок на сейчас" />
        <MetricTile icon={<Clock3 size={21} />} label="Ожидают ответа" value={waitingChats} detail="в выбранных очередях" />
        <MetricTile icon={<AlertTriangle size={21} />} label="SLA-риски" value={overdueChats} detail="требуют внимания" tone="danger" />
      </div>

      <section className="panel-definition-strip">
        <CircleHelp aria-hidden="true" size={19} />
        <div>
          <strong>Как считать нагрузку</strong>
          <span>«Сейчас» — активные диалоги / лимит. «За период» — назначения и переводы за {workloadLabel.toLowerCase()}. Очереди и SLA всегда показывают актуальный снимок.</span>
        </div>
      </section>

      {!allOperators.length && !queues.length ? (
        <ScreenStateStrip items={[{ label: "Панель", tone: "empty", value: "Для текущей организации пока нет данных очередей" }]} />
      ) : null}

      <div className="ops-layout panel-ops-layout">
        <section className="work-panel panel-workload-panel">
          <header className="panel-section-header">
            <div>
              <h2>{shiftIsActive ? "Нагрузка операторов смены" : "Доступные операторы"}</h2>
              <p>{shiftIsActive ? "В таблице только состав текущей смены." : "Пока смена не задана: показаны доступные сотрудники для её формирования."}</p>
            </div>
            <span>{workloadLabel}</span>
          </header>
          {!displayOperators.length ? (
            <div className="panel-empty-row">Нет операторов, соответствующих выбранной очереди.</div>
          ) : (
            <div className="operator-table panel-operator-table" role="table" aria-label="Нагрузка операторов текущей смены">
              <div className="operator-row operator-table-head" role="row">
                <span aria-hidden="true" />
                <span role="columnheader">Оператор</span>
                <span role="columnheader">На линии с</span>
                <span role="columnheader">Статус</span>
                <span role="columnheader">Сейчас</span>
                <span role="columnheader">За период</span>
                <span role="columnheader">SLA</span>
                <span role="columnheader">Каналы</span>
              </div>
              {displayOperators.map((operator) => {
                const presence = teamPresenceByOperator.get(String(operator.id));
                const status = presence?.status ?? operator.status;
                const statusSince = presence?.since ?? operator.presenceSince;
                const lineStartedAt = presence?.lineStartedAt ?? null;
                const activity = operator.activity ?? {};
                const statusView = resolveOperatorPresenceView({ dataQuality: workload.dataQuality, nowMs, operator, status, statusSince });
                const activityTotal = Number(activity.total ?? activity.assignmentCount ?? 0);
                return (
                  <div className="operator-row" key={operator.id ?? operator.name} role="row">
                    <span className={`operator-presence ${statusView.cssClass}`} aria-label={statusView.label} />
                    <span className="operator-name-cell" role="cell">
                      <OperatorAvatar avatar={operator.avatar ?? presence?.avatar} decorative name={operator.name} size={28} />
                      <strong className="operator-name">{operator.name}</strong>
                    </span>
                    <span className="operator-line-entry" role="cell" title={lineStartedAt ? `Первый выход на линию: ${formatPanelDateTime(lineStartedAt)}` : "Выход на линию в выбранную дату не зафиксирован"}>
                      {formatLineEntry(lineStartedAt, presenceDate)}
                    </span>
                    <span className="operator-status-cell" role="cell">
                      <b>{statusView.label}</b>
                      <small>{statusView.duration}</small>
                    </span>
                    <span className="operator-load-cell" role="cell">
                      <span className="load-meter"><i style={{ width: `${loadPercent(operator.chats, operator.limit)}%` }} /></span>
                      <b>{operator.chats ?? 0} / {operator.limit ?? "—"}</b>
                    </span>
                    <span className="operator-activity" role="cell" title={workloadPeriod === "live" ? "Для текущего снимка историческая активность не рассчитывается." : "Назначения и переводы за выбранный период"}>
                      {workloadPeriod === "live" ? "—" : `${activityTotal}`}
                    </span>
                    <span className="operator-sla" role="cell">{formatSla(operator.sla ?? operator.slaPercent)}</span>
                    <span role="cell"><ChannelList channels={operator.channels ?? []} /></span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="work-panel panel-queue-panel">
          <header className="panel-section-header">
            <div><h2>Очереди и каналы</h2><p>Актуальная ситуация в выбранном срезе.</p></div>
            <span>{channel === "Все каналы" ? "Все очереди" : channel}</span>
          </header>
          {!queues.length ? <div className="panel-empty-row">Нет очередей для выбранного фильтра.</div> : (
            <div className="queue-health-list">
              {queues.map((queue) => (
                <article className="queue-health" key={queue.name ?? queue.channel}>
                  <header>
                    <ChannelBadge channel={queue.name ?? queue.channel} />
                    <strong>{queue.active ?? 0} активных</strong>
                  </header>
                  <div className="queue-health-grid">
                    <span>Ожидают <b>{queue.waiting ?? 0}</b></span>
                    <span>SLA-риски <b>{queue.overdue ?? 0}</b></span>
                    <span>Лимит <b>{Number(queue.limit) > 0 ? queue.limit : "—"}</b></span>
                  </div>
                  <div className="health-bar"><i style={{ width: `${Math.min(100, Number(queue.health ?? 0))}%` }} /></div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="work-panel presence-summary-panel" data-testid="presence-summary-panel">
        <header className="panel-section-header presence-section-header">
          <div>
            <h2>Время в статусах</h2>
            <p>Интервалы за {formatPanelDate(presenceDate)}{presenceDate === todayPresenceDate ? " по текущий момент" : ""}. Колонка «На линии с» показывает первое появление онлайн за эту дату.</p>
          </div>
          <div className="presence-date-controls">
            <label>
              <CalendarDays aria-hidden="true" size={16} />
              <input aria-label="Дата времени в статусах" max={todayPresenceDate} onChange={(event) => changePresenceDate(event.target.value)} type="date" value={presenceDate} />
            </label>
            <button disabled={presenceDate === todayPresenceDate} onClick={() => setPresenceDate(todayPresenceDate)} type="button">Сегодня</button>
          </div>
        </header>
        {workspace.errors.presence ? (
          <WorkspaceState actionLabel="Повторить" description={workspace.errors.presence} onAction={workspace.refresh} title="Не удалось обновить время в статусах" tone="error" />
        ) : !workspace.presence ? (
          <div className="panel-empty-row">Статусы команды ещё загружаются.</div>
        ) : !displayPresenceOperators.length ? (
          <ScreenStateStrip items={[{ label: "Статусы", tone: "empty", value: "За эту дату нет зафиксированных статусов" }]} />
        ) : (
          <div className="presence-summary-scroll">
            <div className="presence-summary-table" role="table" aria-label={`Время операторов в статусах за ${formatPanelDate(presenceDate)}`}>
              <div className="presence-summary-row presence-summary-head" role="row">
                <span role="columnheader">Оператор</span>
                <span role="columnheader">Текущий статус</span>
                <span role="columnheader">На линии с</span>
                {PRESENCE_STATUSES.map((status) => <span key={status.key} role="columnheader" title={status.label}>{status.shortLabel}</span>)}
              </div>
              {displayPresenceOperators.map((row) => (
                <div className="presence-summary-row" key={row.operatorId} role="row">
                  <span className="operator-name-with-avatar" role="cell">
                    <OperatorAvatar avatar={row.avatar} decorative name={row.name} size={26} />
                    <strong>{row.name}</strong>
                  </span>
                  <span className="presence-summary-status" role="cell">
                    <i className={`operator-presence ${presenceStatusClass(row.status)}`} aria-hidden="true" />
                    {row.status ? presenceStatusLabel(row.status) : PRESENCE_STATUS_NOT_SET_LABEL}
                  </span>
                  <span className="presence-line-entry" role="cell" title={row.lineStartedAt ? formatPanelDateTime(row.lineStartedAt) : "Выход на линию не зафиксирован"}>{formatLineEntry(row.lineStartedAt, presenceDate)}</span>
                  {PRESENCE_STATUSES.map((status) => {
                    const seconds = Number(row.seconds?.[status.key] ?? 0);
                    const isCurrent = row.status === status.key;
                    const hasDuration = Number.isFinite(seconds) && seconds > 0;
                    return <span className={isCurrent ? "presence-summary-current" : ""} key={status.key} role="cell">{hasDuration || isCurrent ? formatPresenceSeconds(Math.max(0, seconds)) : "—"}</span>;
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {redistributionPreview ? (
        <RedistributionPreviewModal
          busy={redistributionBusy}
          onClose={closeRedistributionPreview}
          onConfirm={() => void confirmRedistribution()}
          preview={redistributionPreview}
        />
      ) : null}
      {redistributionHelpOpen ? <RedistributionHelpModal onClose={() => setRedistributionHelpOpen(false)} /> : null}
      {shiftManagerOpen ? (
        <ShiftManagerModal
          onClose={() => setShiftManagerOpen(false)}
          onSaved={() => workspace.refresh()}
          onToast={onToast}
          operators={teamPresenceOperators}
          shift={workspace.shift}
        />
      ) : null}
    </ProductScreen>
  );
}

function PanelLiveStatus({ nowMs, offline, onRefresh, refreshing, stale, updatedAt }) {
  const tone = offline || stale ? "warning" : "healthy";
  const label = offline ? "Нет соединения" : stale ? "Данные требуют обновления" : "Данные актуальны";
  return (
    <div className="panel-live-status" aria-live="polite">
      <span className={`panel-live-dot ${tone}`} aria-hidden="true" />
      <div><strong>{label}</strong><small>{refreshing ? "Обновляем…" : `Обновлено ${formatRefreshTime(updatedAt, nowMs)}`}</small></div>
      <span className="panel-auto-refresh">каждые {PANEL_AUTO_REFRESH_MS / 1_000} сек</span>
      <button aria-label="Обновить данные панели" disabled={refreshing} onClick={onRefresh} title="Обновить сейчас" type="button"><RefreshCw className={refreshing ? "spin" : ""} size={17} /></button>
    </div>
  );
}

function ShiftSummaryItem({ detail, label, tone, value }) {
  return <div className={`shift-summary-item ${tone ?? ""}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}

function RedistributionPreviewModal({ busy, onClose, onConfirm, preview }) {
  const plan = Array.isArray(preview.plan) ? preview.plan : [];
  const conflicts = Array.isArray(preview.capacityConflicts) ? preview.capacityConflicts : [];
  const ready = Boolean(preview.readyToCommit) && plan.length > 0;
  return (
    <Modal
      closeLabel="Закрыть предпросмотр перераспределения"
      footer={<><button onClick={onClose} type="button">Отмена</button><button className="primary-action" disabled={!ready || busy} onClick={onConfirm} type="button">{busy ? "Применяем…" : `Применить ${plan.length} назначений`}</button></>}
      onClose={onClose}
      overlayClassName="redistribution-overlay"
      panelClassName="redistribution-panel"
      title="Предпросмотр перераспределения"
      titleId="routing-redistribution-title"
    >
      <div className="redistribution-intro">Система распределит ожидающие диалоги по правилу «минимальная нагрузка» и применит изменения только после подтверждения.</div>
      <div className="redistribution-summary">
        <span><b>{plan.length}</b> назначений</span>
        <span><b>{preview.selectedQueues?.length ?? 0}</b> очередей</span>
        <span><b>{preview.slaImpact?.riskDialogsIncluded ?? 0}</b> SLA-рисков</span>
      </div>
      {conflicts.length ? <div className="redistribution-conflicts">{conflicts.map((conflict, index) => <span key={`${conflict.conversationId ?? conflict.queue ?? "conflict"}-${index}`}>{humanizeRedistributionConflict(conflict)}</span>)}</div> : null}
      {!plan.length ? <div className="redistribution-empty">Нет диалогов, которые можно безопасно назначить по текущим правилам.</div> : (
        <div className="redistribution-plan" role="table" aria-label="План перераспределения">
          <div className="redistribution-row redistribution-head" role="row"><span>Очередь</span><span>Диалог</span><span>Будет назначен</span><span>Результат</span></div>
          {plan.map((item) => (
            <div className="redistribution-row" key={item.conversationId} role="row">
              <span role="cell">{item.channel}</span>
              <strong role="cell">{item.conversationId}</strong>
              <span role="cell">{item.targetOperatorName}</span>
              <b className={`redistribution-sla ${item.slaTone ?? ""}`} role="cell">{slaToneLabel(item.slaTone)}</b>
            </div>
          ))}
        </div>
      )}
      <p className="redistribution-recheck">Перед применением сервер повторно проверит присутствие, доступ к очереди и лимиты. Если ситуация изменилась, он не применит небезопасные назначения.</p>
    </Modal>
  );
}

function RedistributionHelpModal({ onClose }) {
  return (
    <Modal
      closeLabel="Закрыть справку о перераспределении"
      footer={<button className="primary-action" onClick={onClose} type="button">Понятно</button>}
      onClose={onClose}
      overlayClassName="redistribution-overlay"
      panelClassName="redistribution-help-panel"
      title="Как работает перераспределение"
      titleId="routing-help-title"
    >
      <div className="redistribution-help-body">
        <ol>
          <li>В план попадают только ожидающие диалоги выбранных очередей.</li>
          <li>Для каждого диалога система ищет оператора с доступом к очереди, допустимым статусом и свободным лимитом.</li>
          <li>Из подходящих кандидатов выбирается наименее загруженный; при равенстве учитывается ротация назначений.</li>
          <li>Сначала вы видите план и исключения, затем отдельно подтверждаете применение.</li>
        </ol>
        <p>Действие фиксируется сервером и в аудите. Повторная проверка непосредственно перед применением защищает от назначения сверх лимита.</p>
      </div>
    </Modal>
  );
}

function resolveOperatorPresenceView({ dataQuality, nowMs, operator, status, statusSince }) {
  const recorded = operator.presenceSource === "operator_presence" || Boolean(status);
  if (dataQuality?.canonical && !recorded) return { cssClass: "unknown", duration: "—", label: PRESENCE_STATUS_NOT_SET_LABEL };
  return {
    cssClass: presenceStatusClass(status),
    duration: statusSince ? formatPresenceDuration(statusSince, nowMs) : "—",
    label: presenceStatusLabel(status)
  };
}

function resolveRedistributionQueues(queues) {
  return queues.filter((queue) => Number(queue.waiting ?? 0) > 0).map((queue) => queue.channel).filter(Boolean);
}

function redistributionUnavailableReason(access, selectedQueues, busy) {
  if (!access.canRedistribute) return access.reason ?? "Недостаточно прав для перераспределения.";
  if (!selectedQueues.length) return "В выбранных очередях нет диалогов, ожидающих ответа.";
  return busy ? "Подготовка или применение плана уже выполняется." : "Перераспределение недоступно.";
}

function createRedistributionKey(channel) {
  const scope = channel === "Все каналы" ? "all" : channel;
  return `panel-${scope}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function resolvePanelNotificationContext(navigationTarget, overdueChats) {
  if (navigationTarget?.screen !== "panel" || navigationTarget?.focus !== "sla") return null;
  const target = String(navigationTarget.tenantId ?? navigationTarget.resourceId ?? "").trim();
  return {
    badge: `${overdueChats} SLA`,
    detail: target ? `Контекст уведомления: ${target}. Проверьте очереди с риском.` : "Контекст уведомления: проверьте очереди с SLA-риском.",
    focus: "sla",
    title: "Открыто из SLA-уведомления"
  };
}

function isShiftActive(shift, nowMs) {
  if (!shift?.startsAt || !shift?.endsAt || !Array.isArray(shift.operatorIds) || !shift.operatorIds.length) return false;
  const startsAt = Date.parse(shift.startsAt);
  const endsAt = Date.parse(shift.endsAt);
  return Number.isFinite(startsAt) && Number.isFinite(endsAt) && startsAt <= nowMs && nowMs < endsAt;
}

function shiftCommandLabel(shift) {
  if (!shift) return "Не определена";
  return Date.parse(shift.startsAt) > Date.now() ? "Запланирована" : "Завершена";
}

function formatLineEntry(value, selectedDate) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const localDate = currentLocalDateValue(date);
  return localDate === selectedDate ? formatPanelTime(date) : formatPanelDateTime(date);
}

function loadPercent(chats, limit) {
  const numerator = Number(chats ?? 0);
  const denominator = Number(limit ?? 0);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return Math.max(0, Math.min(100, (numerator / denominator) * 100));
}

function formatSla(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? `${number}%` : "—";
}

function slaToneLabel(tone) {
  if (tone === "danger") return "SLA-риск";
  if (tone === "warn") return "Внимание";
  return "В норме";
}

function humanizeRedistributionConflict(conflict) {
  if (conflict.code === "no_eligible_operator") return `${conflict.conversationId ?? "Диалог"}: нет оператора со свободной ёмкостью и подходящим статусом.`;
  if (conflict.code === "queue_not_found") return `${conflict.queue ?? "Очередь"}: очередь не найдена.`;
  return `${conflict.queue ?? conflict.conversationId ?? "Диалог"}: ${conflict.code ?? "не включён в план"}.`;
}
