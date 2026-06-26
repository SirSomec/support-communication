import React, { useState } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Download,
  FileText,
  ListChecks,
  Pencil,
  PlayCircle,
  Plus,
  Sparkles,
  Workflow,
  Zap
} from "lucide-react";
import { createScreenStateItems } from "../../app/screenState.js";
import { auditEvents, botScenarios, proactiveRules } from "../../data.js";
import { ChannelBadge, ChannelList, MetricTile, ProductScreen, SectionTitle } from "../../ui.jsx";

const botNodeTypeOptions = [
  { id: "message", label: "Сообщение" },
  { id: "quick_replies", label: "Быстрые ответы" },
  { id: "condition", label: "Условие" },
  { id: "contact_request", label: "Запрос контакта" },
  { id: "webhook", label: "Webhook" },
  { id: "handoff", label: "Handoff" },
  { id: "fallback", label: "Fallback" }
];
const botNodeTypeLabels = Object.fromEntries(botNodeTypeOptions.map((type) => [type.id, type.label]));

export function AutomationScreen({ onBack, onToast, access }) {
  const [scenarioItems, setScenarioItems] = useState(botScenarios);
  const [selectedScenarioId, setSelectedScenarioId] = useState(botScenarios[0].id);
  const [selectedNodeId, setSelectedNodeId] = useState(botScenarios[0].flowNodes[0].id);
  const [importDraft, setImportDraft] = useState("");
  const [importError, setImportError] = useState("");
  const selectedScenario = scenarioItems.find((scenario) => scenario.id === selectedScenarioId) ?? scenarioItems[0];
  const selectedNode = selectedScenario.flowNodes.find((node) => node.id === selectedNodeId) ?? selectedScenario.flowNodes[0];
  const canManageAutomation = access.canManageSettings;
  const enabledScenarios = scenarioItems.filter((scenario) => scenario.status.includes("Включ") || scenario.status.includes("Р’РєР»")).length;
  const enabledProactive = proactiveRules.filter((rule) => rule.status.includes("Включ") || rule.status.includes("Р’РєР»")).length;
  const automationChannels = ["SDK", "Telegram", "MAX", "VK"];
  const channelAssignments = automationChannels.map((channel) => ({
    channel,
    scenario: scenarioItems.find((scenario) => scenario.channels.includes(channel))
  }));
  const botMetricRows = [
    { label: "Диалогов с ботом", value: "312", detail: "24 часа" },
    { label: "Успешно без оператора", value: "41%", detail: "по выбранным сценариям" },
    { label: "Handoff rate", value: "37%", detail: selectedScenario.handoff },
    { label: "Fallback", value: "8%", detail: "нет intent или данных" }
  ];
  const afterHoursPolicy = {
    name: "Нерабочее время",
    window: "21:00-09:00",
    channels: selectedScenario.channels,
    behavior: "Собрать телефон, тему, номер заказа и создать обращение без ожидания оператора",
    fallback: "Если клиент просит человека, показать срок ответа и поставить SLA-таймер"
  };
  const exportPayload = JSON.stringify({
    schemaVersion: selectedScenario.schemaVersion,
    exportVersion: selectedScenario.exportVersion,
    id: selectedScenario.id,
    name: selectedScenario.name,
    status: selectedScenario.status,
    owner: selectedScenario.owner,
    updatedAt: selectedScenario.updatedAt,
    trigger: selectedScenario.trigger,
    channels: selectedScenario.channels,
    flowNodes: selectedScenario.flowNodes,
    flowEdges: selectedScenario.flowEdges,
    validationRules: selectedScenario.validationRules,
    previewMessages: selectedScenario.previewMessages,
    testCases: selectedScenario.testCases,
    handoff: selectedScenario.handoff
  }, null, 2);

  function selectScenario(scenario) {
    setSelectedScenarioId(scenario.id);
    setSelectedNodeId(scenario.flowNodes[0]?.id ?? "");
    setImportDraft("");
    setImportError("");
  }

  function updateSelectedNode(field, value) {
    setScenarioItems((current) => current.map((scenario) => {
      if (scenario.id !== selectedScenario.id) {
        return scenario;
      }

      return {
        ...scenario,
        flowNodes: scenario.flowNodes.map((node) => node.id === selectedNode.id
          ? { ...node, [field]: value, ...(field === "type" ? { typeLabel: botNodeTypeLabels[value] } : {}) }
          : node
        )
      };
    }));
  }

  function handleAddNode() {
    if (!canManageAutomation) {
      onToast(access.reason);
      return;
    }

    const nextNode = {
      id: `node-${Date.now()}`,
      type: "message",
      typeLabel: botNodeTypeLabels.message,
      title: "Новая нода",
      detail: "Опишите условие, ответ или handoff.",
      channel: selectedScenario.channels[0] ?? "SDK",
      position: { x: 1, y: Math.ceil((selectedScenario.flowNodes.length + 1) / 2) }
    };

    setScenarioItems((current) => current.map((scenario) => scenario.id === selectedScenario.id
      ? {
          ...scenario,
          flowNodes: [...scenario.flowNodes, nextNode],
          flowEdges: [
            ...(scenario.flowEdges ?? []),
            ...(scenario.flowNodes.length ? [{ from: scenario.flowNodes.at(-1).id, to: nextNode.id, label: "next" }] : [])
          ]
        }
      : scenario
    ));
    setSelectedNodeId(nextNode.id);
    onToast("Нода добавлена в canvas сценария.");
  }

  function handleScenarioCreate() {
    if (!canManageAutomation) {
      onToast(access.reason);
      return;
    }

    const id = `bot-draft-${Date.now()}`;
    const draftScenario = {
      id,
      name: "Новый сценарий",
      status: "Черновик",
      schemaVersion: "bot-flow/v1",
      owner: "Администратор",
      updatedAt: "сейчас",
      trigger: "Опишите триггер",
      channels: ["SDK"],
      steps: ["Триггер", "Ответ", "Handoff"],
      handoff: "Очередь 1-я линия",
      successRate: 0,
      flowNodes: [
        { id: `${id}-message`, type: "message", typeLabel: "Сообщение", title: "Новый триггер", detail: "Условие запуска сценария", channel: "SDK", position: { x: 1, y: 1 } },
        { id: `${id}-condition`, type: "condition", typeLabel: "Условие", title: "Условие перехода", detail: "Правило ветвления сценария", channel: "SDK", position: { x: 2, y: 1 } },
        { id: `${id}-handoff`, type: "handoff", typeLabel: "Handoff", title: "Передача оператору", detail: "Очередь и причина handoff", channel: "SDK", position: { x: 3, y: 1 } }
      ],
      flowEdges: [
        { from: `${id}-message`, to: `${id}-condition`, label: "next" },
        { from: `${id}-condition`, to: `${id}-handoff`, label: "handoff" }
      ],
      validationRules: ["phone"],
      previewMessages: [
        { side: "client", speaker: "Клиент", time: "00:01", text: "Пример входящего сообщения." },
        { side: "bot", speaker: "Бот", time: "00:03", text: "Черновик ответа бота." },
        { side: "bot", speaker: "Бот", time: "00:07", text: "При необходимости подключу оператора." }
      ],
      testCases: [
        { id: `${id}-default`, name: "Базовый тест", expected: "handoff" }
      ],
      exportVersion: "flow-v1.3"
    };

    setScenarioItems((current) => [draftScenario, ...current]);
    setSelectedScenarioId(id);
    setSelectedNodeId(draftScenario.flowNodes[0].id);
    setImportDraft("");
    setImportError("");
    onToast("Черновик сценария создан в конструкторе.");
  }

  function handleAssignChannel(channel, scenarioId) {
    if (!canManageAutomation) {
      onToast(access.reason);
      return;
    }

    const targetScenario = scenarioItems.find((scenario) => scenario.id === scenarioId);

    setScenarioItems((current) => current.map((scenario) => {
      const nextChannels = scenario.id === scenarioId
        ? Array.from(new Set([...scenario.channels, channel]))
        : scenario.channels.filter((item) => item !== channel);

      return { ...scenario, channels: nextChannels };
    }));
    onToast(`${channel}: назначен бот "${targetScenario?.name ?? "сценарий"}".`);
  }

  function handleImportFlow() {
    if (!canManageAutomation) {
      onToast(access.reason);
      return;
    }

    try {
      const payload = JSON.parse(importDraft);
      const validNodeTypes = new Set(botNodeTypeOptions.map((type) => type.id));
      const hasValidNodes = Array.isArray(payload.flowNodes) &&
        payload.flowNodes.length &&
        payload.flowNodes.every((node) => node.id && validNodeTypes.has(node.type));
      const hasValidEdges = payload.flowEdges === undefined ||
        (Array.isArray(payload.flowEdges) && payload.flowEdges.every((edge) => edge.from && edge.to));

      if (!payload.name || !hasValidNodes || !hasValidEdges) {
        throw new Error("JSON должен содержать name, flowNodes с валидными type и корректные flowEdges.");
      }

      setScenarioItems((current) => current.map((scenario) => scenario.id === selectedScenario.id
        ? {
            ...scenario,
            name: payload.name,
            status: payload.status ?? scenario.status,
            schemaVersion: payload.schemaVersion ?? scenario.schemaVersion,
            owner: payload.owner ?? scenario.owner,
            updatedAt: "сейчас",
            trigger: payload.trigger ?? scenario.trigger,
            channels: Array.isArray(payload.channels) ? payload.channels : scenario.channels,
            handoff: payload.handoff ?? scenario.handoff,
            flowNodes: payload.flowNodes.map((node) => ({ ...node, typeLabel: node.typeLabel ?? botNodeTypeLabels[node.type] })),
            flowEdges: Array.isArray(payload.flowEdges) ? payload.flowEdges : scenario.flowEdges,
            validationRules: Array.isArray(payload.validationRules) ? payload.validationRules : scenario.validationRules,
            previewMessages: Array.isArray(payload.previewMessages) ? payload.previewMessages : scenario.previewMessages,
            testCases: Array.isArray(payload.testCases) ? payload.testCases : scenario.testCases,
            exportVersion: payload.exportVersion ?? payload.version ?? scenario.exportVersion
          }
        : scenario
      ));
      setSelectedNodeId(payload.flowNodes[0].id);
      setImportError("");
      onToast(`Импортирован flow: ${payload.name}.`);
    } catch (error) {
      setImportError(error.message || "Импорт не выполнен: вставьте валидный JSON flow.");
    }
  }

  function handleExportFlowDownload() {
    if (!canManageAutomation) {
      onToast(access.reason);
      return;
    }

    const blob = new Blob([exportPayload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${selectedScenario.id}.json`;
    link.click();
    URL.revokeObjectURL(url);
    onToast(`${selectedScenario.name}: JSON export скачан.`);
  }

  return (
    <ProductScreen
      title="Боты и автоматизация"
      subtitle="Сценарии AI-оператора, proactive-приглашения, handoff в очереди и audit действий автоматики."
      onBack={onBack}
      stateItems={createScreenStateItems({
        total: scenarioItems.length,
        empty: `${scenarioItems.length} сценариев`,
        emptyWhenZero: "сценариев нет",
        errors: importError ? 1 : 0,
        errorLabel: "ошибок flow нет"
      })}
      actions={
        <>
          <button disabled={!canManageAutomation} onClick={handleScenarioCreate} title={canManageAutomation ? "Создать сценарий" : access.reason} type="button">
            <Plus size={17} />
            Новый сценарий
          </button>
          <button className="primary-action" disabled={!canManageAutomation} onClick={() => onToast(`Тестовый прогон "${selectedScenario.name}" запущен.`)} title={canManageAutomation ? "Прогнать тест" : access.reason} type="button">
            <PlayCircle size={17} />
            Прогнать тест
          </button>
        </>
      }
    >
      <div className="metric-strip">
        <MetricTile icon={<Bot size={21} />} label="Сценарии" value={scenarioItems.length} detail={`${enabledScenarios} включены`} />
        <MetricTile icon={<Zap size={21} />} label="Proactive" value={proactiveRules.length} detail={`${enabledProactive} активны`} />
        <MetricTile icon={<Workflow size={21} />} label="Handoff" value="4" detail="очереди назначения" />
        <MetricTile icon={<ListChecks size={21} />} label="Audit" value={auditEvents.length} detail="последние события" />
      </div>

      <div className="automation-insight-grid">
        <section className="work-panel bot-assignment-panel">
          <SectionTitle title="Боты по каналам" action="один активный сценарий на канал" />
          <div className="bot-assignment-list">
            {channelAssignments.map(({ channel, scenario }) => (
              <label key={channel}>
                <span><ChannelBadge channel={channel} /> {scenario?.status ?? "Не назначен"}</span>
                <select
                  disabled={!canManageAutomation}
                  onChange={(event) => handleAssignChannel(channel, event.target.value)}
                  value={scenario?.id ?? ""}
                >
                  <option value="" disabled>Выберите сценарий</option>
                  {scenarioItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
            ))}
          </div>
        </section>

        <section className="work-panel after-hours-card">
          <SectionTitle title="Нерабочее время" action={afterHoursPolicy.window} />
          <p>{afterHoursPolicy.behavior}</p>
          <small>{afterHoursPolicy.fallback}</small>
          <ChannelList channels={afterHoursPolicy.channels} />
        </section>

        <section className="work-panel bot-metrics-card">
          <SectionTitle title="Метрики ботов" action="срез демо-данных" />
          <div className="bot-metric-list">
            {botMetricRows.map((metric) => (
              <span key={metric.label}>
                <b>{metric.value}</b>
                <strong>{metric.label}</strong>
                <small>{metric.detail}</small>
              </span>
            ))}
          </div>
        </section>

        <section className="work-panel bot-handoff-card">
          <SectionTitle title="Handoff summary" action={selectedScenario.handoff} />
          <p>Оператор получает trigger, собранные поля, последний ответ бота и причину передачи до первого ручного сообщения.</p>
          <div>
            <span>Поля: {selectedScenario.validationRules.join(", ")}</span>
            <span>Последний тест: {selectedScenario.testCases[0]?.expected ?? "handoff"}</span>
          </div>
        </section>
      </div>

      <div className="automation-layout">
        <section className="work-panel">
          <SectionTitle title="Конструктор сценариев" action="триггер -> шаги -> handoff" />
          <div className="scenario-list">
            {scenarioItems.map((scenario) => (
              <article className={`scenario-card ${selectedScenario.id === scenario.id ? "selected" : ""}`} key={scenario.id}>
                <header>
                  <Bot size={18} />
                  <strong>{scenario.name}</strong>
                  <span>{scenario.status}</span>
                </header>
                <p>{scenario.trigger}</p>
                <ol>
                  {scenario.steps.map((step) => <li key={step}>{step}</li>)}
                </ol>
                <footer>
                  <ChannelList channels={scenario.channels} />
                  <b>{scenario.successRate}%</b>
                  <button onClick={() => selectScenario(scenario)} type="button">Открыть</button>
                </footer>
              </article>
            ))}
          </div>
        </section>

        <section className="work-panel">
          <SectionTitle title="Audit автоматизации" action="экспорт, лимиты, rescue" />
          <div className="audit-list">
            {auditEvents.map((event) => (
              <article className="audit-row" key={event.id}>
                <time>{event.time}</time>
                <strong>{event.action}</strong>
                <span>{event.actor} · {event.role}</span>
                <p>{event.target}: {event.detail}</p>
              </article>
            ))}
          </div>
        </section>
      </div>

      <section className="work-panel bot-builder-panel">
        <SectionTitle title="Canvas сценария" action={`${selectedScenario.name} · ${selectedScenario.status}`} />
        <div className="bot-builder-grid">
          <div className="bot-canvas-panel">
            <div className="bot-canvas-toolbar">
              <strong>{selectedScenario.trigger}</strong>
              <span>{selectedScenario.handoff} · {selectedScenario.schemaVersion} · {selectedScenario.owner}</span>
            </div>
            <div className="bot-flow-canvas" aria-label="Ноды сценария">
              {selectedScenario.flowNodes.map((node, index) => (
                <button
                  aria-pressed={selectedNode.id === node.id}
                  className={`bot-flow-node ${selectedNode.id === node.id ? "selected" : ""} ${node.type}`}
                  key={node.id}
                  onClick={() => setSelectedNodeId(node.id)}
                  type="button"
                >
                  <span>{index + 1}</span>
                  <strong>{node.title}</strong>
                  <small>{node.typeLabel ?? botNodeTypeLabels[node.type] ?? node.type} · {node.channel}</small>
                  <p>{node.detail}</p>
                </button>
              ))}
            </div>
            <div className="bot-edge-list" aria-label="Связи сценария">
              {(selectedScenario.flowEdges ?? []).map((edge) => (
                <span key={`${edge.from}-${edge.to}-${edge.label}`}>
                  {edge.from} {"->"} {edge.to} <b>{edge.label}</b>
                </span>
              ))}
            </div>
          </div>

          <aside className="bot-node-editor">
            <header>
              <Pencil size={17} />
              <strong>Редактор ноды</strong>
            </header>
            <label>
              <span>Тип</span>
              <select disabled={!canManageAutomation} value={selectedNode.type} onChange={(event) => updateSelectedNode("type", event.target.value)}>
                {botNodeTypeOptions.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
              </select>
            </label>
            <label>
              <span>Название</span>
              <input disabled={!canManageAutomation} value={selectedNode.title} onChange={(event) => updateSelectedNode("title", event.target.value)} />
            </label>
            <label>
              <span>Каналы</span>
              <input disabled={!canManageAutomation} value={selectedNode.channel} onChange={(event) => updateSelectedNode("channel", event.target.value)} />
            </label>
            <label>
              <span>Логика</span>
              <textarea disabled={!canManageAutomation} value={selectedNode.detail} onChange={(event) => updateSelectedNode("detail", event.target.value)} />
            </label>
            <footer>
              <button disabled={!canManageAutomation} onClick={handleAddNode} title={canManageAutomation ? "Добавить ноду" : access.reason} type="button">
                <Plus size={16} />
                Нода
              </button>
              <button disabled={!canManageAutomation} onClick={() => onToast(`${selectedScenario.name}: изменения сохранены в черновике.`)} title={canManageAutomation ? "Сохранить сценарий" : access.reason} type="button">
                <CheckCircle2 size={16} />
                Сохранить
              </button>
            </footer>
            <div className="bot-validation-list">
              <strong>Validation</strong>
              {(selectedScenario.validationRules ?? []).map((rule) => <span key={rule}>{rule}</span>)}
              <strong>Test cases</strong>
              {(selectedScenario.testCases ?? []).map((test) => <span key={test.id}>{test.name} {"->"} {test.expected}</span>)}
            </div>
          </aside>

          <aside className="bot-preview-panel">
            <div className="bot-transcript-preview">
              <header>
                <Sparkles size={17} />
                <strong>Transcript preview</strong>
              </header>
              {selectedScenario.previewMessages.map((message, index) => (
                <div className={`bot-preview-message ${message.side ?? (message.speaker === "Клиент" ? "client" : "bot")}`} key={`${message.speaker}-${index}`}>
                  <span>{message.speaker} · {message.time ?? `00:0${index + 1}`}</span>
                  <p>{message.text}</p>
                </div>
              ))}
            </div>
            <div className="bot-io-panel">
              <header>
                <FileText size={17} />
                <strong>Import / Export</strong>
              </header>
              <textarea readOnly value={exportPayload} aria-label="JSON export сценария" />
              <textarea disabled={!canManageAutomation} value={importDraft} onChange={(event) => setImportDraft(event.target.value)} placeholder="Вставьте JSON flow для импорта" />
              {importError ? (
                <div className="bot-import-error">
                  <AlertTriangle size={15} />
                  {importError}
                </div>
              ) : null}
              <footer>
                <button disabled={!canManageAutomation} onClick={() => setImportDraft(exportPayload)} title={canManageAutomation ? "Скопировать export в импорт" : access.reason} type="button">Вставить export</button>
                <button disabled={!canManageAutomation} onClick={handleImportFlow} title={canManageAutomation ? "Импортировать flow" : access.reason} type="button">Импорт</button>
                <button disabled={!canManageAutomation} onClick={handleExportFlowDownload} title={canManageAutomation ? "Экспортировать JSON" : access.reason} type="button">
                  <Download size={15} />
                  Export
                </button>
              </footer>
            </div>
          </aside>
        </div>
      </section>
    </ProductScreen>
  );
}
