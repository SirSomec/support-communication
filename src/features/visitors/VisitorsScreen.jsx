import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  MessageSquareWarning,
  Pencil,
  PlayCircle,
  ToggleLeft,
  ToggleRight,
  UsersRound,
  Zap
} from "lucide-react";
import { createScreenStateItems } from "../../app/screenState.js";
import { dialogService } from "../../services/dialogService.js";
import { visitorService } from "../../services/visitorService.js";
import { ChannelBadge, ChannelList, MetricTile, ProductScreen, SectionTitle } from "../../ui.jsx";
import "./visitors.css";

const proactiveChannelOptions = ["SDK", "Telegram", "MAX", "VK"];

export function VisitorsScreen({ onBack, onToast, access }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeVisitors, setActiveVisitors] = useState([]);
  const [rescueChats, setRescueChats] = useState([]);
  const [proactiveRuleItems, setProactiveRuleItems] = useState([]);
  const [selectedVisitorId, setSelectedVisitorId] = useState("");
  const [selectedRuleId, setSelectedRuleId] = useState("");

  useEffect(() => {
    let ignore = false;

    async function loadWorkspace() {
      setLoading(true);
      setError("");
      const response = await visitorService.fetchVisitorWorkspace();
      if (ignore) {
        return;
      }

      if (response.status !== "ok") {
        setError(response.error?.message ?? "Не удалось загрузить визиты.");
        setLoading(false);
        return;
      }

      const visitors = (Array.isArray(response.data?.activeVisitors) ? response.data.activeVisitors : []).map(toVisitorRow);
      const rules = (Array.isArray(response.data?.proactiveRules) ? response.data.proactiveRules : []).map(toProactiveRuleRow);
      const chats = Array.isArray(response.data?.rescueChats) ? response.data.rescueChats : [];
      setActiveVisitors(visitors);
      setProactiveRuleItems(rules);
      setRescueChats(chats);
      setSelectedVisitorId(visitors[0]?.id ?? "");
      setSelectedRuleId(rules[0]?.id ?? "");
      setLoading(false);
    }

    void loadWorkspace();
    return () => {
      ignore = true;
    };
  }, []);

  const selectedVisitor = activeVisitors.find((visitor) => visitor.id === selectedVisitorId) ?? activeVisitors[0] ?? null;
  const selectedRule = proactiveRuleItems.find((rule) => rule.id === selectedRuleId) ?? proactiveRuleItems[0] ?? null;
  const activeVariant = selectedRule?.variants?.find((variant) => variant.id === selectedRule.activeVariant) ?? selectedRule?.variants?.[0] ?? { text: "" };
  const typingCount = activeVisitors.filter((visitor) => visitor.typing).length;
  const criticalRescue = rescueChats.filter((chat) => chat.priority === "Критичный").length;
  const canManageProactive = access.canManageSettings;

  if (loading) {
    return (
      <ProductScreen
        title="Активные визиты и спасение"
        subtitle="Загрузка..."
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
        title="Активные визиты и спасение"
        subtitle="Ошибка загрузки"
        onBack={onBack}
        stateItems={[
          { label: "Загрузка", tone: "error", value: "ошибка" },
          { label: "Данные", tone: "empty", value: "недоступны" },
          { label: "Ошибки", tone: "error", value: error }
        ]}
      />
    );
  }

  if (!selectedVisitor || !selectedRule) {
    return (
      <ProductScreen
        title="Активные визиты и спасение"
        subtitle="Нет данных визитов"
        onBack={onBack}
        stateItems={createScreenStateItems({
          total: 0,
          emptyWhenZero: "активных визитов и правил нет",
          errorLabel: "ошибок нет"
        })}
      />
    );
  }

  function updateProactiveRule(field, value) {
    setProactiveRuleItems((current) => current.map((rule) => rule.id === selectedRule.id ? { ...rule, [field]: value } : rule));
  }

  function toggleProactiveChannel(channel) {
    const nextChannels = selectedRule.channels.includes(channel)
      ? selectedRule.channels.filter((item) => item !== channel)
      : [...selectedRule.channels, channel];
    updateProactiveRule("channels", nextChannels.length ? nextChannels : [channel]);
  }

  function updateProactiveVariant(variantId, text) {
    setProactiveRuleItems((current) => current.map((rule) => {
      if (rule.id !== selectedRule.id) {
        return rule;
      }

      return {
        ...rule,
        variants: rule.variants.map((variant) => variant.id === variantId ? { ...variant, text } : variant),
        message: rule.activeVariant === variantId ? text : rule.message
      };
    }));
  }

  function selectProactiveVariant(variant) {
    setProactiveRuleItems((current) => current.map((rule) => rule.id === selectedRule.id
      ? { ...rule, activeVariant: variant.id, message: variant.text }
      : rule
    ));
  }

  async function handleSaveProactiveRule() {
    if (!canManageProactive) {
      return;
    }

    const response = await visitorService.saveProactiveRule(selectedRule);
    if (response.status !== "ok" || !response.data?.rule) {
      onToast(response.error?.message ?? "Не удалось сохранить proactive-правило.");
      return;
    }

    setProactiveRuleItems((current) => current.map((rule) => rule.id === response.data.rule.id ? response.data.rule : rule));
    onToast(`Правило "${selectedRule.name}" сохранено: ${response.data.frequencyCap?.id ?? "frequency-cap"}, ${response.data.experiment?.id ?? "experiment"}.`);
  }

  async function handleRescueAction(chat) {
    const response = await visitorService.triggerRescueReturn(chat);
    if (response.status !== "ok") {
      onToast(response.error?.message ?? "Не удалось выполнить rescue-действие.");
      return;
    }

    const result = response.data?.summary?.queue ?? response.data?.summary?.reason ?? response.data?.eventId ?? "";
    onToast(`${chat.client}: ${chat.nextAction}. ${result}`);
  }

  async function handleStartVisitorDialog() {
    if (!access.canOutbound) {
      onToast(access.reason);
      return;
    }

    if (!selectedVisitor.phone) {
      onToast("Нельзя начать исходящий диалог: посетитель еще не передал телефон.");
      return;
    }

    const response = await dialogService.createOutboundConversationRequest({
      channel: selectedVisitor.channel,
      clientName: selectedVisitor.name,
      message: activeVariant.text || selectedRule.message || "Здравствуйте! Готовы помочь в этом диалоге.",
      phone: selectedVisitor.phone,
      topic: selectedVisitor.segment || selectedRule.name || "Proactive visitor"
    });

    if (response.status !== "ok") {
      onToast(response.error?.message ?? "Не удалось поставить исходящий диалог в очередь.");
      return;
    }

    onToast(`${selectedVisitor.name}: исходящий диалог поставлен в очередь ${response.data?.descriptorId ?? response.data?.backendQueueId ?? ""}.`);
  }

  return (
    <ProductScreen
      title="Активные визиты и спасение"
      subtitle="Наблюдение SDK/VK-сессий до начала чата, proactive-приглашения и очередь спасения диалогов с таймерами."
      onBack={onBack}
      stateItems={createScreenStateItems({
        total: activeVisitors.length,
        empty: `${activeVisitors.length} активных визитов`,
        emptyWhenZero: "активных визитов нет",
        errors: criticalRescue,
        errorLabel: "критичных rescue нет"
      })}
      actions={
        <>
          <button
            disabled={!canManageProactive}
            onClick={handleSaveProactiveRule}
            title={canManageProactive ? "Сохранить proactive-правило" : access.reason}
            type="button"
          >
            <Zap size={17} />
            Сохранить правило
          </button>
          <button className="primary-action" disabled={!access.canOutbound || !selectedVisitor.phone} onClick={() => void handleStartVisitorDialog()} title={!access.canOutbound ? access.reason : selectedVisitor.phone ? "Начать диалог" : "Посетитель еще не передал телефон"} type="button">
            <MessageSquareWarning size={17} />
            Начать диалог
          </button>
        </>
      }
    >
      <div className="metric-strip">
        <MetricTile icon={<UsersRound size={21} />} label="Активные визиты" value={activeVisitors.length} detail="SDK и внешние каналы" />
        <MetricTile icon={<Pencil size={21} />} label="Печатает до чата" value={typingCount} detail="только контекст без текста ввода" />
        <MetricTile icon={<AlertTriangle size={21} />} label="Спасение" value={rescueChats.length} detail={`${criticalRescue} критичных`} tone="danger" />
        <MetricTile icon={<Zap size={21} />} label="Proactive" value={`${Math.max(...proactiveRuleItems.map((rule) => rule.acceptanceRate))}%`} detail="принятие лучшего правила" />
      </div>

      <div className="visitors-layout">
        <section className="work-panel">
          <SectionTitle title="Посетители сейчас" action="контекст до обращения" />
          <div className="visitor-list">
            {activeVisitors.map((visitor) => (
              <button
                className={`visitor-row ${selectedVisitor.id === visitor.id ? "selected" : ""}`}
                key={visitor.id}
                onClick={() => setSelectedVisitorId(visitor.id)}
                type="button"
              >
                <span>
                  <strong>{visitor.name}</strong>
                  <small>{visitor.phone || "телефон еще не передан"} · {visitor.device}</small>
                </span>
                <ChannelBadge channel={visitor.channel} />
                <b>{visitor.activeFor}</b>
                <em>{visitor.typing ? "печатает" : visitor.segment}</em>
              </button>
            ))}
          </div>
        </section>

        <section className="work-panel visitor-detail">
          <SectionTitle title="Контекст визита" action={selectedVisitor.privacy} />
          <div className="detail-stack">
            <InfoPill label="Страница" value={selectedVisitor.page} />
            <InfoPill label="Точка входа" value={selectedVisitor.entry} />
            <InfoPill label="Последнее событие" value={selectedVisitor.lastEvent} />
            <InfoPill label="Маршрут" value={selectedVisitor.operatorHint} />
          </div>
          <div className="sdk-timeline">
            {["identifyUser", "trackEntryPoint", "viewScreen", "openSupport"].map((event, index) => (
              <div className="timeline-row" key={event}>
                <span>{`11:${24 + index}`}</span>
                <strong>{event}</strong>
                <small>{index === 0 ? selectedVisitor.phone || "anonymous" : selectedVisitor.page}</small>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="visitors-layout">
        <section className="work-panel">
          <SectionTitle title="Очередь спасения" action="возврат в очередь и контроль старшего" />
          <div className="rescue-list">
            {rescueChats.map((chat) => (
              <article className="rescue-row" key={chat.id}>
                <header>
                  <ChannelBadge channel={chat.channel} />
                  <strong>{chat.client}</strong>
                  <b>{chat.timer}</b>
                </header>
                <p>{chat.reason}</p>
                <footer>
                  <span>{chat.operator}</span>
                  <button onClick={() => handleRescueAction(chat)} type="button">Выполнить</button>
                </footer>
              </article>
            ))}
          </div>
        </section>

        <section className="work-panel">
          <SectionTitle title="Proactive-правила" action="A/B, cooldown, privacy" />
          <div className="proactive-list">
            {proactiveRuleItems.map((rule) => (
              <button className={`proactive-row ${selectedRule.id === rule.id ? "selected" : ""}`} key={rule.id} onClick={() => setSelectedRuleId(rule.id)} type="button">
                <header>
                  <strong>{rule.name}</strong>
                  <span>{rule.status}</span>
                </header>
                <p>{rule.segment}</p>
                <small>{rule.message}</small>
                <footer>
                  <ChannelList channels={rule.channels} />
                  <b>{rule.acceptanceRate}%</b>
                </footer>
              </button>
            ))}
          </div>
        </section>
      </div>

      <section className="work-panel proactive-builder-panel">
        <SectionTitle title="Visual builder proactive" action={`${selectedRule.name} · ${selectedRule.status}`} />
        <div className="proactive-builder-grid">
          <div className="proactive-rule-form">
            <label>
              <span>Название правила</span>
              <input disabled={!canManageProactive} value={selectedRule.name} onChange={(event) => updateProactiveRule("name", event.target.value)} />
            </label>
            <label>
              <span>Условие / сегмент</span>
              <textarea disabled={!canManageProactive} value={selectedRule.segment} onChange={(event) => updateProactiveRule("segment", event.target.value)} />
            </label>
            <label>
              <span>Экран или URL</span>
              <input disabled={!canManageProactive} value={selectedRule.screen} onChange={(event) => updateProactiveRule("screen", event.target.value)} />
            </label>
            <div className="proactive-field-row">
              <label>
                <span>Задержка показа</span>
                <input disabled={!canManageProactive} value={selectedRule.triggerDelay} onChange={(event) => updateProactiveRule("triggerDelay", event.target.value)} />
              </label>
              <label>
                <span>Cooldown</span>
                <input disabled={!canManageProactive} value={selectedRule.cooldown} onChange={(event) => updateProactiveRule("cooldown", event.target.value)} />
              </label>
            </div>
            <div className="proactive-field-row">
              <label>
                <span>Рабочее время</span>
                <input disabled={!canManageProactive} value={selectedRule.workHours} onChange={(event) => updateProactiveRule("workHours", event.target.value)} />
              </label>
              <label>
                <span>Offline form</span>
                <input disabled={!canManageProactive} value={selectedRule.offlineForm} onChange={(event) => updateProactiveRule("offlineForm", event.target.value)} />
              </label>
            </div>
            <label>
              <span>Privacy</span>
              <input disabled={!canManageProactive} value={selectedRule.privacyNotice} onChange={(event) => updateProactiveRule("privacyNotice", event.target.value)} />
            </label>
            <div className="proactive-channel-editor" aria-label="Каналы proactive-правила">
              {proactiveChannelOptions.map((channel) => (
                <button
                  className={selectedRule.channels.includes(channel) ? "selected" : ""}
                  disabled={!canManageProactive}
                  key={channel}
                  onClick={() => toggleProactiveChannel(channel)}
                  type="button"
                >
                  {selectedRule.channels.includes(channel) ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                  {channel}
                </button>
              ))}
            </div>
          </div>

          <aside className="proactive-preview-panel">
            <div className="proactive-widget-preview">
              <header>
                <span>{selectedVisitor.channel}</span>
                <b>{selectedRule.screen}</b>
              </header>
              <strong>{selectedRule.name}</strong>
              <p>{activeVariant.text}</p>
              <footer>
                <button type="button">Написать</button>
                <button type="button">Не сейчас</button>
              </footer>
            </div>
            <div className="proactive-rule-summary">
              <InfoPill label="Показ" value={`${selectedRule.triggerDelay} · ${selectedRule.workHours}`} />
              <InfoPill label="Cooldown" value={selectedRule.cooldown} />
              <InfoPill label="Принятие" value={`${selectedRule.acceptanceRate}%`} />
              <InfoPill label="Конверсия / отказ" value={`${selectedRule.conversionRate}% / ${selectedRule.dismissRate}%`} />
            </div>
            <div className="proactive-ab-list">
              {selectedRule.variants.map((variant) => (
                <article className={selectedRule.activeVariant === variant.id ? "active" : ""} key={variant.id}>
                  <header>
                    <strong>Вариант {variant.label}</strong>
                    <button disabled={!canManageProactive} onClick={() => selectProactiveVariant(variant)} type="button">
                      {selectedRule.activeVariant === variant.id ? <CheckCircle2 size={15} /> : <PlayCircle size={15} />}
                      {selectedRule.activeVariant === variant.id ? "Активен" : "Сделать активным"}
                    </button>
                  </header>
                  <textarea disabled={!canManageProactive} value={variant.text} onChange={(event) => updateProactiveVariant(variant.id, event.target.value)} />
                  <footer>
                    <span>Конверсия {variant.conversion}%</span>
                    <span>Отказы {variant.dismiss}%</span>
                  </footer>
                </article>
              ))}
            </div>
          </aside>
        </div>
      </section>
    </ProductScreen>
  );
}

function InfoPill({ label, value }) {
  return (
    <div className="info-pill">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function toVisitorRow(visitor) {
  return {
    activeFor: visitor.activeFor ?? "сейчас",
    channel: visitor.channel ?? "SDK",
    device: visitor.device ?? "Unknown",
    entry: visitor.entry ?? visitor.page ?? "unknown",
    id: visitor.id,
    lastEvent: visitor.lastEvent ?? visitor.status ?? "browsing",
    name: visitor.name ?? visitor.id ?? "Анонимный посетитель",
    operatorHint: visitor.operatorHint ?? "Очередь по умолчанию",
    page: visitor.page ?? "/",
    phone: visitor.phone ?? "",
    privacy: visitor.privacy ?? "anonymous",
    segment: visitor.segment ?? "visitor",
    typing: Boolean(visitor.typing)
  };
}

function toProactiveRuleRow(rule) {
  const variants = Array.isArray(rule.variants) && rule.variants.length
    ? rule.variants
    : [
        { id: "A", label: "A", text: rule.message ?? "Здравствуйте! Нужна помощь?", conversion: 0, dismiss: 0 },
        { id: "B", label: "B", text: rule.message ?? "Готовы подключить оператора.", conversion: 0, dismiss: 0 }
      ];

  return {
    acceptanceRate: rule.acceptanceRate ?? 0,
    activeVariant: rule.activeVariant ?? variants[0]?.id ?? "A",
    channels: Array.isArray(rule.channels) && rule.channels.length ? rule.channels : ["SDK"],
    conversionRate: rule.conversionRate ?? 0,
    cooldown: rule.cooldown ?? "24h",
    dismissRate: rule.dismissRate ?? 0,
    id: rule.id,
    message: rule.message ?? variants[0]?.text ?? "",
    name: rule.name ?? rule.id ?? "Proactive rule",
    offlineForm: rule.offlineForm ?? "default",
    privacyNotice: rule.privacyNotice ?? "standard",
    screen: rule.screen ?? rule.segment ?? "visitor",
    segment: rule.segment ?? "visitor",
    status: rule.status ?? "draft",
    triggerDelay: rule.triggerDelay ?? "5s",
    variants,
    workHours: rule.workHours ?? "24/7"
  };
}
