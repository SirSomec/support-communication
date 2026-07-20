import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Code2,
  Laptop,
  MessageCircleMore,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Webhook,
  Workflow
} from "lucide-react";
import { FieldHint, InlineHint, SettingsModal } from "./SettingsPrimitives.jsx";
import {
  buildChannelConnectionPayload,
  formatConnectionStatus,
  integrationProducts,
  validateIntegrationSetup
} from "./integrationCenterModel.js";
import { integrationService } from "../../services/integrationService.js";
import { routingService } from "../../services/routingService.js";

const productIcons = {
  api: Code2,
  "external-app": Laptop,
  max: MessageCircleMore,
  sdk: Workflow,
  telegram: Send,
  vk: MessageCircleMore
};

const initialForm = {
  groupId: "",
  name: "",
  outboundUrl: "",
  routingQueueId: "",
  token: ""
};

function statusClass(status) {
  return status === "active" ? "active" : "paused";
}

export function IntegrationCenterPanel({ access, canEditSettings, onManage, onSummaryChange, onToast }) {
  const [activeView, setActiveView] = useState("connections");
  const [connections, setConnections] = useState([]);
  const [externalApps, setExternalApps] = useState([]);
  const [queues, setQueues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [wizard, setWizard] = useState(null);
  const [wizardStep, setWizardStep] = useState(0);
  const [form, setForm] = useState(initialForm);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState("");
  const [created, setCreated] = useState(null);
  const [testResult, setTestResult] = useState(null);

  const canMutate = canEditSettings && !error;
  const connectedProductIds = useMemo(() => {
    const types = new Set(connections.map((connection) => connection.type));
    if (externalApps.length) types.add("external-app");
    return types;
  }, [connections, externalApps]);
  const allConnections = useMemo(() => [
    ...connections.map((connection) => ({
      id: connection.id,
      kind: "channel",
      name: connection.name,
      status: connection.status,
      type: connection.type,
      updatedAt: connection.updatedAt
    })),
    ...externalApps.map((app) => ({
      id: app.id,
      kind: "external",
      name: app.name,
      status: app.status,
      type: "external-app",
      updatedAt: app.updatedAt
    }))
  ], [connections, externalApps]);

  useEffect(() => {
    loadCenter();
  }, []);

  async function loadCenter() {
    setLoading(true);
    setError("");
    const [channelResponse, appResponse, queueResponse] = await Promise.all([
      integrationService.fetchChannelConnections(),
      integrationService.fetchExternalChatChannels(),
      routingService.fetchQueues({ status: "active" })
    ]);

    if (channelResponse.status !== "ok" || appResponse.status !== "ok" || queueResponse.status !== "ok") {
      setError(
        channelResponse.error?.message
        ?? appResponse.error?.message
        ?? queueResponse.error?.message
        ?? "Не удалось загрузить подключения. Попробуйте обновить страницу."
      );
      setConnections([]);
      setExternalApps([]);
      setQueues([]);
      onSummaryChange?.({ unavailable: true });
      setLoading(false);
      return;
    }

    const nextConnections = channelResponse.data.connections ?? [];
    const nextApps = appResponse.data.items ?? [];
    setConnections(nextConnections);
    setExternalApps(nextApps);
    setQueues(queueResponse.data.queues ?? []);
    onSummaryChange?.({
      active: [...nextConnections, ...nextApps].filter((connection) => connection.status === "active").length,
      total: nextConnections.length + nextApps.length
    });
    setLoading(false);
  }

  function openProduct(product) {
    if (product.kind === "technical") {
      onManage?.(product.technicalWorkspace);
      return;
    }

    if (!canMutate) {
      onToast?.(access.reason);
      return;
    }

    setWizard(product);
    setWizardStep(0);
    setForm({ ...initialForm, routingQueueId: queues[0]?.id ?? "" });
    setFormError("");
    setCreated(null);
    setTestResult(null);
  }

  function closeWizard() {
    if (busy) return;
    setWizard(null);
  }

  async function goForward() {
    if (!wizard || busy) return;
    setFormError("");

    if (wizardStep === 0) {
      setWizardStep(1);
      return;
    }

    if (wizardStep === 1) {
      const validationError = validateIntegrationSetup(wizard, form);
      if (validationError) {
        setFormError(validationError);
        return;
      }
      setWizardStep(2);
      return;
    }

    if (wizardStep === 2) {
      if (!form.routingQueueId) {
        setFormError("Выберите очередь, в которую будут попадать новые обращения.");
        return;
      }
      await createIntegration();
      return;
    }

    closeWizard();
  }

  async function createIntegration() {
    if (!wizard) return;
    setBusy("create");
    const response = wizard.kind === "external"
      ? await integrationService.createExternalChatChannel({
        name: form.name.trim(),
        outboundUrl: form.outboundUrl.trim(),
        routingQueueId: form.routingQueueId
      })
      : await integrationService.createChannelConnection(buildChannelConnectionPayload(wizard, form));
    setBusy("");

    if (response.status !== "ok") {
      setFormError(response.error?.message ?? "Не удалось создать подключение. Проверьте данные и попробуйте ещё раз.");
      return;
    }

    const item = wizard.kind === "external" ? response.data.channel : response.data.connection;
    setCreated({
      connection: item,
      providerRuntime: response.data.providerRuntime,
      type: wizard.kind
    });
    setWizardStep(3);
    await loadCenter();
    onToast?.(`${item.name}: подключение создано.`);
  }

  async function runTest() {
    if (!created?.connection?.id || busy || wizard?.kind === "external") return;
    setBusy("test");
    setTestResult(null);
    const response = await integrationService.testChannelConnectionInstance({
      connectionId: created.connection.id,
      message: "Проверка нового подключения из Центра интеграций",
      mode: "receive",
      recipient: "+7 999 000-00-00"
    });
    setBusy("");

    if (response.status !== "ok") {
      setTestResult({ error: response.error?.message ?? "Тест пока не выполнен." });
      return;
    }
    setTestResult({ status: response.data?.delivery?.status ?? "accepted_to_queue" });
    onToast?.(`${created.connection.name}: тест выполнен.`);
  }

  return (
    <section className="settings-section integration-center" aria-labelledby="integration-center-title">
      <header className="integration-center-header">
        <div>
          <span className="integration-center-time"><CircleHelp size={15} /> Подключение займёт 2–5 минут</span>
          <h2 id="integration-center-title">Центр интеграций</h2>
          <p>Подключайте каналы и сервисы в одном месте. Мы покажем только нужные шаги и проверим результат.</p>
        </div>
        <button className="settings-ghost-action" disabled={loading} onClick={loadCenter} type="button">
          <RefreshCw size={16} /> Обновить
        </button>
      </header>

      <div className="integration-center-layout">
        <div className="integration-center-main">
          <div className="integration-view-switch" role="tablist" aria-label="Раздел центра интеграций">
            <button aria-selected={activeView === "connections"} className={activeView === "connections" ? "active" : ""} onClick={() => setActiveView("connections")} role="tab" type="button">
              Мои подключения
            </button>
            <button aria-selected={activeView === "catalog"} className={activeView === "catalog" ? "active" : ""} onClick={() => setActiveView("catalog")} role="tab" type="button">
              Каталог
            </button>
          </div>

          {error ? (
            <div className="settings-rule-error" role="alert">{error}</div>
          ) : null}

          {activeView === "connections" ? (
            <ConnectionsView
              connections={allConnections}
              loading={loading}
              onBrowse={() => setActiveView("catalog")}
              onManage={onManage}
            />
          ) : null}

          {activeView === "catalog" ? (
            <CatalogView
              canMutate={canMutate}
              connectedProductIds={connectedProductIds}
              onOpenProduct={openProduct}
            />
          ) : null}
        </div>
        <HowItWorks onBrowse={() => setActiveView("catalog")} />
      </div>

      {wizard ? (
        <IntegrationWizard
          busy={busy}
          created={created}
          form={form}
          formError={formError}
          onBack={() => setWizardStep((step) => Math.max(0, step - 1))}
          onChange={setForm}
          onClose={closeWizard}
          onForward={goForward}
          onRunTest={runTest}
          product={wizard}
          queues={queues}
          step={wizardStep}
          testResult={testResult}
        />
      ) : null}
    </section>
  );
}

function ConnectionsView({ connections, loading, onBrowse, onManage }) {
  if (loading) {
    return <div className="integration-empty-state">Загружаем ваши подключения…</div>;
  }

  if (!connections.length) {
    return (
      <div className="integration-empty-state">
        <PlugMark />
        <strong>Подключений пока нет</strong>
        <span>Выберите продукт из каталога — мастер проведёт через настройку и поможет проверить результат.</span>
        <button className="primary-action" onClick={onBrowse} type="button"><Plus size={16} /> Выбрать продукт</button>
      </div>
    );
  }

  return (
    <div className="integration-connection-list">
      <div className="integration-list-toolbar">
        <span>Здесь отображаются все работающие и приостановленные подключения.</span>
        <button className="integration-manage-channels" onClick={() => onManage?.("channels")} type="button">Управлять каналами</button>
      </div>
      {connections.map((connection) => {
        const product = integrationProducts.find((item) => item.type === connection.type || item.id === connection.type);
        const Icon = productIcons[connection.type] ?? PlugMark;
        return (
          <article className="integration-connection-row" key={`${connection.kind}-${connection.id}`}>
            <span className="integration-product-icon"><Icon size={21} /></span>
            <div className="integration-connection-name">
              <strong>{connection.name}</strong>
              <span>{product?.name ?? connection.type}</span>
            </div>
            <span className={`integration-status ${statusClass(connection.status)}`}>{formatConnectionStatus(connection.status)}</span>
            <button onClick={() => onManage?.(connection.kind === "external" ? "external" : "channels")} type="button">
              Управлять <ChevronRight size={16} />
            </button>
          </article>
        );
      })}
      <button className="integration-add-inline" onClick={onBrowse} type="button"><Plus size={16} /> Подключить ещё продукт</button>
    </div>
  );
}

function CatalogView({ canMutate, connectedProductIds, onOpenProduct }) {
  return (
    <div className="integration-catalog-list">
      {integrationProducts.map((product) => {
        const Icon = productIcons[product.id] ?? PlugMark;
        const isConnected = connectedProductIds.has(product.type ?? product.id);
        return (
          <article className="integration-catalog-row" key={product.id}>
            <span className="integration-product-icon"><Icon size={23} /></span>
            <div className="integration-catalog-copy">
              <strong>{product.name}</strong>
              <span>{product.description}</span>
            </div>
            <small>{product.requirement}</small>
            <button className={product.kind === "technical" ? "" : "primary-outline"} disabled={!canMutate && product.kind !== "technical"} onClick={() => onOpenProduct(product)} type="button">
              {product.kind === "technical" ? "Открыть" : isConnected ? "Добавить ещё" : "Подключить"}
            </button>
          </article>
        );
      })}
    </div>
  );
}

function HowItWorks({ onBrowse }) {
  return (
    <aside className="integration-how-it-works">
      <h3>Как это работает</h3>
      <ol>
        <li><b>1</b><span><strong>Выберите продукт</strong><small>Откройте нужный канал или сервис из каталога.</small></span></li>
        <li><b>2</b><span><strong>Выполните настройку</strong><small>Подскажем, где взять данные и зачем они нужны.</small></span></li>
        <li><b>3</b><span><strong>Начните работать</strong><small>Проверим подключение и направим обращения в очередь.</small></span></li>
      </ol>
      <button onClick={onBrowse} type="button">Выбрать продукт <ArrowRight size={15} /></button>
    </aside>
  );
}

function IntegrationWizard({ busy, created, form, formError, onBack, onChange, onClose, onForward, onRunTest, product, queues, step, testResult }) {
  const stepLabels = product.kind === "external"
    ? ["Выбор", "Приложение", "Очередь", "Готово"]
    : ["Выбор", "Доступ", "Очередь", "Проверка"];
  const isComplete = step === 3;
  const title = isComplete ? `${product.name} подключён` : `Подключить ${product.name}`;

  return (
    <SettingsModal
      eyebrow="Центр интеграций"
      footer={
        isComplete ? (
          <button className="primary-action" onClick={onClose} type="button">Готово</button>
        ) : (
          <>
            {step > 0 ? <button disabled={Boolean(busy)} onClick={onBack} type="button"><ArrowLeft size={16} /> Назад</button> : <span />}
            <button className="primary-action" disabled={Boolean(busy)} onClick={onForward} type="button">
              {busy === "create" ? "Подключаем…" : step === 2 ? "Подключить" : "Продолжить"} <ArrowRight size={16} />
            </button>
          </>
        )
      }
      onClose={onClose}
      title={title}
      titleId="integration-wizard-title"
    >
      <div className="integration-wizard">
        <ol className="integration-stepper" aria-label="Этапы подключения">
          {stepLabels.map((label, index) => <li className={index === step ? "current" : index < step ? "done" : ""} key={label}><span>{index < step ? <CheckCircle2 size={15} /> : index + 1}</span>{label}</li>)}
        </ol>
        {step === 0 ? <WizardIntro product={product} /> : null}
        {step === 1 ? <WizardAccess form={form} onChange={onChange} product={product} /> : null}
        {step === 2 ? <WizardQueue form={form} onChange={onChange} queues={queues} /> : null}
        {step === 3 ? <WizardSuccess created={created} onRunTest={onRunTest} product={product} testResult={testResult} busy={busy} /> : null}
        {formError ? <div className="settings-form-error" role="alert">{formError}</div> : null}
      </div>
    </SettingsModal>
  );
}

function WizardIntro({ product }) {
  const Icon = productIcons[product.id] ?? PlugMark;
  return (
    <div className="integration-wizard-intro">
      <span className="integration-product-icon large"><Icon size={29} /></span>
      <h3>{product.name}</h3>
      <p>{product.description}</p>
      <InlineHint><ShieldCheck size={16} /> {product.requirement}</InlineHint>
    </div>
  );
}

function WizardAccess({ form, onChange, product }) {
  return (
    <div className="integration-wizard-form settings-form">
      <p className="integration-wizard-lead">Сначала дадим подключению понятное имя. Его будут видеть операторы и администраторы.</p>
      <label>
        <span>Название подключения</span>
        <input autoFocus onChange={(event) => onChange({ ...form, name: event.target.value })} placeholder={product.kind === "external" ? "Чат в мобильном приложении" : `${product.name} для поддержки`} value={form.name} />
        <FieldHint>Например, «Основной бот» или «Чат на сайте».</FieldHint>
      </label>
      {product.credential ? (
        <label>
          <span>{product.credential.label}</span>
          <input onChange={(event) => onChange({ ...form, token: event.target.value })} placeholder={product.credential.placeholder} type="password" value={form.token} />
          <FieldHint>{product.credential.hint}</FieldHint>
        </label>
      ) : null}
      {product.id === "vk" ? (
        <label>
          <span>ID сообщества VK <em>необязательно</em></span>
          <input onChange={(event) => onChange({ ...form, groupId: event.target.value })} placeholder="Например, 123456789" value={form.groupId} />
          <FieldHint>Помогает связать подключение с нужным сообществом. Можно добавить позже в расширенных настройках.</FieldHint>
        </label>
      ) : null}
      {product.kind === "external" ? (
        <label>
          <span>Адрес для ответов операторов <em>необязательно</em></span>
          <input onChange={(event) => onChange({ ...form, outboundUrl: event.target.value })} placeholder="https://example.ru/support/replies" value={form.outboundUrl} />
          <FieldHint>Ваш сервер будет получать ответы операторов. Если адреса ещё нет, добавьте его позже.</FieldHint>
        </label>
      ) : null}
    </div>
  );
}

function WizardQueue({ form, onChange, queues }) {
  return (
    <div className="integration-wizard-form settings-form">
      <p className="integration-wizard-lead">Выберите, какая команда будет получать новые обращения. Это можно изменить в любой момент.</p>
      <label>
        <span>Очередь для новых обращений</span>
        <select disabled={!queues.length} onChange={(event) => onChange({ ...form, routingQueueId: event.target.value })} value={form.routingQueueId}>
          {!queues.length ? <option value="">Нет доступных очередей</option> : null}
          {queues.map((queue) => <option key={queue.id} value={queue.id}>{queue.name}</option>)}
        </select>
        <FieldHint>Все новые сообщения из этого подключения попадут в выбранную очередь.</FieldHint>
      </label>
      <InlineHint><CircleHelp size={16} /> Не уверены, что выбрать? Начните с основной очереди поддержки.</InlineHint>
    </div>
  );
}

function WizardSuccess({ busy, created, onRunTest, product, testResult }) {
  const runtime = created?.providerRuntime;
  return (
    <div className="integration-wizard-success">
      <CheckCircle2 size={34} />
      <h3>Подключение готово</h3>
      <p>Теперь новые обращения будут попадать в выбранную очередь. Ниже можно сразу убедиться, что всё работает.</p>
      {product.kind === "external" && created?.connection ? (
        <div className="integration-issued-details">
          <strong>Данные для вашего приложения</strong>
          <code>{created.connection.inboundPath}</code>
          <FieldHint>Токен показывается только сейчас. Скопируйте его в настройках внешнего приложения, если он нужен вашему разработчику.</FieldHint>
          {created.connection.token ? <code>{created.connection.token}</code> : null}
        </div>
      ) : null}
      {runtime?.webhookSecret ? (
        <div className="integration-issued-details">
          <strong>Секрет webhook</strong>
          <code>{runtime.webhookSecret}</code>
          <FieldHint>Сохраните его сейчас: используйте секрет в настройках {product.name} для проверки входящих событий.</FieldHint>
        </div>
      ) : null}
      {product.kind === "channel" ? (
        <div className="integration-test-card">
          <div><strong>Проверить подключение</strong><span>Отправим безопасное тестовое событие в выбранную очередь.</span></div>
          <button disabled={busy === "test"} onClick={onRunTest} type="button"><RefreshCw size={16} /> {busy === "test" ? "Проверяем…" : "Запустить тест"}</button>
        </div>
      ) : null}
      {testResult ? <div className={testResult.error ? "integration-test-result error" : "integration-test-result"}>{testResult.error ?? `Проверка пройдена: ${testResult.status}.`}</div> : null}
    </div>
  );
}

function PlugMark(props) {
  return <Webhook {...props} />;
}
