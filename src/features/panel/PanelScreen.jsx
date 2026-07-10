import React, { useEffect, useState } from "react";
import { AlertTriangle, Clock3, Inbox, UsersRound, Workflow } from "lucide-react";
import { submitRoutingRedistribution } from "../../app/routingActions.js";
import { createScreenStateItems } from "../../app/screenState.js";
import { routingService } from "../../services/routingService.js";
import { ChannelBadge, ChannelList, MetricTile, Modal, ProductScreen, ScreenStateStrip, SectionTitle } from "../../ui.jsx";

export function PanelScreen({ onBack, onToast, access, navigationTarget = null }) {
  const [channel, setChannel] = useState("Все каналы");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [operators, setOperators] = useState([]);
  const [queues, setQueues] = useState([]);
  const [totals, setTotals] = useState(null);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [redistributionBusy, setRedistributionBusy] = useState(false);
  const [redistributionPayload, setRedistributionPayload] = useState(null);
  const [redistributionPreview, setRedistributionPreview] = useState(null);

  useEffect(() => {
    let ignore = false;

    async function loadWorkload() {
      setLoading(true);
      setError("");
      const response = await routingService.fetchWorkload({
        channel: channel === "Все каналы" ? undefined : channel
      });

      if (ignore) {
        return;
      }

      if (response.status !== "ok") {
        setError(response.error?.message ?? "Не удалось загрузить нагрузку смены.");
        setOperators([]);
        setQueues([]);
        setTotals(null);
        setLoading(false);
        return;
      }

      setOperators(Array.isArray(response.data?.operators) ? response.data.operators : []);
      setQueues(Array.isArray(response.data?.queues) ? response.data.queues : []);
      setTotals(response.data?.totals ?? null);
      setLoading(false);
    }

    void loadWorkload();
    return () => {
      ignore = true;
    };
  }, [channel, reloadVersion]);

  const visibleQueues = queues;
  const activeChats = totals?.activeChats ?? visibleQueues.reduce((sum, queue) => sum + (queue.active ?? 0), 0);
  const waitingChats = totals?.waitingChats ?? visibleQueues.reduce((sum, queue) => sum + (queue.waiting ?? 0), 0);
  const overdueChats = totals?.overdueChats ?? visibleQueues.reduce((sum, queue) => sum + (queue.overdue ?? 0), 0);
  const onlineOperators = totals?.onlineOperators ?? operators.filter((operator) => operator.status === "online").length;
  const channelOptions = ["Все каналы", ...new Set(queues.map((queue) => queue.name ?? queue.channel).filter(Boolean))];
  const selectedQueuesForRedistribution = resolveRedistributionQueues(visibleQueues, channel);
  const panelNotificationContext = resolvePanelNotificationContext(navigationTarget, overdueChats);
  const canRedistribute = access.canRedistribute && selectedQueuesForRedistribution.length > 0 && !redistributionBusy;
  const redistributeUnavailableReason = !access.canRedistribute
    ? access.reason
    : selectedQueuesForRedistribution.length === 0
      ? "Нет очередей с ожидающими диалогами."
      : "Подготовка перераспределения уже выполняется.";

  async function openRedistributionPreview() {
    if (!access.canRedistribute) {
      onToast(access.reason);
      return;
    }

    const selectedQueues = resolveRedistributionQueues(visibleQueues, channel);
    if (selectedQueues.length === 0) {
      onToast("Нет очередей с ожидающими диалогами.");
      return;
    }

    const requestPayload = {
      idempotencyKey: createRedistributionKey(channel),
      reason: "Shift queue redistribution from panel",
      selectedQueues,
      targetRule: "least_loaded"
    };
    setRedistributionBusy(true);
    const response = await routingService.previewRedistribution(requestPayload);
    setRedistributionBusy(false);

    if (response.status !== "ok") {
      onToast(response.error?.message ?? "Не удалось подготовить перераспределение.");
      return;
    }

    setRedistributionPayload({
      ...requestPayload,
      previewId: response.data?.redistributionId
    });
    setRedistributionPreview(response.data);
  }

  async function confirmRedistribution() {
    if (!redistributionPayload) {
      return;
    }

    setRedistributionBusy(true);
    const result = await submitRoutingRedistribution(redistributionPayload);
    setRedistributionBusy(false);

    if (!result.ok) {
      onToast(result.message);
      return;
    }

    setRedistributionPreview(null);
    setRedistributionPayload(null);
    setReloadVersion((current) => current + 1);
    onToast(`Перераспределение применено: ${result.appliedCount} назначений.`);
  }

  if (loading) {
    return (
      <ProductScreen
        title="Панель смены"
        subtitle="Загрузка нагрузки операторов и очередей..."
        onBack={onBack}
        stateItems={createScreenStateItems({
          loading: "загружается...",
          total: 0,
          emptyWhenZero: "ожидание API",
          errorLabel: "ошибок нет"
        })}
      />
    );
  }

  if (error) {
    return (
      <ProductScreen
        title="Панель смены"
        subtitle="Не удалось загрузить данные смены."
        onBack={onBack}
        stateItems={[
          { label: "Загрузка", tone: "error", value: "ошибка" },
          { label: "Данные", tone: "empty", value: "недоступны" },
          { label: "Ошибки", tone: "error", value: error }
        ]}
      />
    );
  }

  return (
    <ProductScreen
      title="Панель смены"
      subtitle="Операторы, очереди, активные диалоги и SLA-риски в одном рабочем окне."
      onBack={onBack}
      stateItems={createScreenStateItems({
        total: visibleQueues.length,
        empty: `${visibleQueues.length} очередей`,
        emptyWhenZero: "очередей нет",
        errors: overdueChats,
        errorLabel: "SLA без ошибок"
      })}
      actions={
        <>
          <select className="inline-select" value={channel} onChange={(event) => setChannel(event.target.value)}>
            {channelOptions.map((option) => <option key={option}>{option}</option>)}
          </select>
          <button className="primary-action" disabled={!canRedistribute} onClick={() => void openRedistributionPreview()} title={canRedistribute ? "Предпросмотр перераспределения" : redistributeUnavailableReason} type="button">
            <Workflow size={17} />
            {redistributionBusy ? "Подготовка..." : "Перераспределить"}
          </button>
        </>
      }
    >
      {redistributionPreview ? (
        <Modal
          closeLabel="Закрыть перераспределение"
          eyebrow="Routing batch"
          footer={
            <>
              <button onClick={() => setRedistributionPreview(null)} type="button">Отмена</button>
              <button className="primary-action" disabled={!redistributionPreview.readyToCommit || redistributionBusy} onClick={() => void confirmRedistribution()} type="button">
                Применить
              </button>
            </>
          }
          onClose={() => setRedistributionPreview(null)}
          overlayClassName="redistribution-overlay"
          panelClassName="redistribution-panel"
          title="Предпросмотр перераспределения"
          titleId="routing-redistribution-title"
        >
          <div className="redistribution-summary">
            <span><b>{redistributionPreview.plan?.length ?? 0}</b> назначений</span>
            <span><b>{redistributionPreview.slaImpact?.riskDialogsIncluded ?? 0}</b> SLA-рисков</span>
            <span><b>{redistributionPreview.selectedQueues?.length ?? 0}</b> очередей</span>
          </div>
          {redistributionPreview.capacityConflicts?.length ? (
            <div className="redistribution-conflicts">
              {redistributionPreview.capacityConflicts.map((conflict, index) => (
                <span key={`${conflict.conversationId ?? conflict.queue}-${index}`}>{conflict.queue ?? conflict.conversationId}: {conflict.code}</span>
              ))}
            </div>
          ) : null}
          <div className="redistribution-plan">
            {(redistributionPreview.plan ?? []).map((item) => (
              <div className="redistribution-row" key={item.conversationId}>
                <span>{item.channel}</span>
                <strong>{item.conversationId}</strong>
                <span>{item.targetOperatorName}</span>
                <b>{item.slaTone}</b>
              </div>
            ))}
          </div>
        </Modal>
      ) : null}

      {!operators.length && !visibleQueues.length ? (
        <ScreenStateStrip items={[{ label: "Panel", tone: "empty", value: "Нет данных нагрузки для текущего tenant" }]} />
      ) : null}

      {panelNotificationContext ? (
        <section className="work-panel panel-notification-context" data-testid="panel-notification-context">
          <div>
            <strong>{panelNotificationContext.title}</strong>
            <span>{panelNotificationContext.detail}</span>
          </div>
          <b>{panelNotificationContext.badge}</b>
        </section>
      ) : null}

      <div className={`metric-strip ${panelNotificationContext?.focus === "sla" ? "sla-focused" : ""}`}>
        <MetricTile icon={<UsersRound size={21} />} label="Операторы онлайн" value={onlineOperators} detail={`${operators.length} в смене`} />
        <MetricTile icon={<Inbox size={21} />} label="Активные диалоги" value={activeChats} detail="по выбранным очередям" />
        <MetricTile icon={<Clock3 size={21} />} label="Ожидают ответа" value={waitingChats} detail="первый ответ" />
        <MetricTile icon={<AlertTriangle size={21} />} label="SLA-риски" value={overdueChats} detail="требуют старшего" tone="danger" />
      </div>

      <div className="ops-layout">
        <section className="work-panel">
          <SectionTitle title="Нагрузка операторов" action="из API routing" />
          <div className="operator-table">
            {operators.map((operator) => (
              <div className="operator-row" key={operator.id ?? operator.name}>
                <span className={`operator-presence ${operator.status}`} />
                <strong className="operator-name">{operator.name}</strong>
                <span className="operator-status">{operator.status === "break" ? "Перерыв" : operator.status === "offline" ? "Офлайн" : "Онлайн"}</span>
                <div className="load-meter">
                  <i style={{ width: `${Math.min(100, ((operator.chats ?? 0) / (operator.limit || 1)) * 100)}%` }} />
                </div>
                <b className="operator-load">{operator.chats} / {operator.limit}</b>
                <span className="operator-time">{operator.avg ?? "—"}</span>
                <span className="operator-sla">{operator.sla ?? operator.slaPercent ?? 0}% SLA</span>
                <ChannelList channels={operator.channels ?? []} />
              </div>
            ))}
          </div>
        </section>

        <section className="work-panel">
          <SectionTitle title="Очереди и каналы" action="Порог ожидания 3 мин" />
          <div className="queue-health-list">
            {visibleQueues.map((queue) => (
              <article className="queue-health" key={queue.name ?? queue.channel}>
                <header>
                  <ChannelBadge channel={queue.name ?? queue.channel} />
                  <strong>{queue.active} активных</strong>
                </header>
                <div className="queue-health-grid">
                  <span>Ожидают <b>{queue.waiting}</b></span>
                  <span>SLA <b>{queue.overdue}</b></span>
                  <span>Лимит <b>{queue.limit}</b></span>
                </div>
                <div className="health-bar">
                  <i style={{ width: `${queue.health ?? 0}%` }} />
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </ProductScreen>
  );
}

function resolveRedistributionQueues(queues, channel) {
  if (channel !== "Все каналы") {
    return [channel];
  }

  return queues
    .filter((queue) => (queue.waiting ?? 0) > 0)
    .map((queue) => queue.name ?? queue.channel)
    .filter(Boolean);
}

function createRedistributionKey(channel) {
  const scope = channel === "Все каналы" ? "all" : channel;
  return `panel-${scope}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function resolvePanelNotificationContext(navigationTarget, overdueChats) {
  if (navigationTarget?.screen !== "panel" || navigationTarget?.focus !== "sla") {
    return null;
  }

  const tenantId = typeof navigationTarget.tenantId === "string" ? navigationTarget.tenantId : "";
  const resourceId = typeof navigationTarget.resourceId === "string" ? navigationTarget.resourceId : "";
  const target = tenantId || resourceId;

  return {
    badge: `${overdueChats} SLA`,
    detail: target
      ? `Контекст уведомления: ${target}. Данные панели остаются в рамках текущей tenant-сессии.`
      : "Контекст уведомления: проверьте очереди с SLA-риском.",
    focus: "sla",
    title: "Открыто из SLA-уведомления"
  };
}
