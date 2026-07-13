import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, Bot, ChevronDown, ChevronRight, RotateCcw, Save, Send, UserRound } from "lucide-react";
import { automationService } from "../../services/automationService.js";
import { SectionTitle } from "../../ui.jsx";

let sandboxMessageCounter = 0;

function nextSandboxMessageId() {
  sandboxMessageCounter += 1;
  return `ui_${Date.now()}_${sandboxMessageCounter}`;
}

/**
 * Живой тест-чат сценария (BAI-804): каждое сообщение проходит настоящий
 * runtime и настоящий AI. Продакшен-диалоги и каналы не затрагиваются.
 */
export function ScenarioSandboxChat({
  accessReason,
  aiReadiness,
  canManage,
  onToast,
  onVerified,
  scenario
}) {
  const [session, setSession] = useState(null);
  const [entries, setEntries] = useState([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState("");
  const [expandedTraces, setExpandedTraces] = useState(() => new Set());
  const [regressionSaved, setRegressionSaved] = useState(false);
  const logRef = useRef(null);
  const inputRef = useRef(null);

  const scenarioId = scenario?.id ?? "";
  const hasAiNode = Boolean(scenario?.flowNodes?.some((node) => node.type === "ai_reply"));
  const aiNotReady = hasAiNode && aiReadiness?.status !== "ready";

  useEffect(() => {
    setSession(null);
    setEntries([]);
    setDraft("");
    setChatError("");
    setExpandedTraces(new Set());
    setRegressionSaved(false);
  }, [scenarioId]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [entries, sending]);

  function toggleTrace(turnId) {
    setExpandedTraces((current) => {
      const next = new Set(current);
      if (next.has(turnId)) {
        next.delete(turnId);
      } else {
        next.add(turnId);
      }
      return next;
    });
  }

  async function ensureSession() {
    if (session) {
      return session;
    }
    const response = await automationService.createBotSandboxSession(scenarioId, {});
    if (response.status !== "ok") {
      throw new Error(response.error?.message ?? "Не удалось начать тестовую сессию.");
    }
    const created = response.data?.session ?? null;
    setSession(created);
    return created;
  }

  async function handleSend(event) {
    event?.preventDefault?.();
    if (!canManage) {
      onToast(accessReason);
      return;
    }
    const text = draft.trim();
    if (!text || sending) {
      return;
    }
    const messageId = nextSandboxMessageId();
    setSending(true);
    setChatError("");
    setDraft("");
    setEntries((current) => [...current, { id: `client-${messageId}`, kind: "client", text }]);
    try {
      const activeSession = await ensureSession();
      const response = await automationService.postBotSandboxMessage(scenarioId, activeSession.id, { messageId, text });
      if (response.status !== "ok") {
        const code = response.error?.code ?? "";
        if (code === "bot_sandbox_session_not_found") {
          setSession(null);
        }
        setChatError(response.error?.message ?? "Не удалось получить ответ бота.");
        return;
      }
      const turn = response.data?.turn ?? {};
      const nextSession = response.data?.session ?? null;
      if (nextSession) {
        setSession(nextSession);
      }
      setRegressionSaved(false);
      setEntries((current) => [
        ...current,
        ...(turn.messages ?? []).map((message) => ({
          citations: message.citations ?? [],
          id: `bot-${message.id}`,
          kind: "bot",
          text: message.text
        })),
        ...(turn.events ?? []).map((eventItem, index) => ({
          eventKind: eventItem.kind,
          id: `event-${messageId}-${index}`,
          kind: "event",
          note: eventItem.note
        })),
        ...(turn.trace ? [{ id: `trace-${messageId}`, kind: "trace", trace: turn.trace }] : [])
      ]);
      onVerified?.(scenarioId);
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "Не удалось получить ответ бота.");
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  async function handleReset() {
    if (session) {
      await automationService.deleteBotSandboxSession(scenarioId, session.id);
    }
    setSession(null);
    setEntries([]);
    setChatError("");
    setExpandedTraces(new Set());
    setRegressionSaved(false);
    onToast("Тестовый диалог сброшен. Бот начнёт сценарий заново.");
    inputRef.current?.focus();
  }

  async function handleSaveRegression() {
    if (!session || !entries.some((entry) => entry.kind === "client")) {
      onToast("Сначала отправьте боту хотя бы одно сообщение.");
      return;
    }
    const response = await automationService.saveBotSandboxRegression(scenarioId, session.id, {});
    if (response.status !== "ok") {
      onToast(response.error?.message ?? "Не удалось сохранить проверочный набор.");
      return;
    }
    setRegressionSaved(true);
    onToast("Диалог сохранён как проверочный набор сценария.");
  }

  const totalTokens = session?.usage?.totalTokens ?? 0;
  const handedOff = session?.status === "handoff";

  return (
    <section className="work-panel sandbox-chat-panel" aria-label="Живой тест-чат сценария">
      <SectionTitle
        title="Тест-чат"
        action={`живой прогон · ${scenario?.name ?? ""}`}
      />
      <p className="sandbox-chat-note">
        Вы пишете как клиент, бот отвечает по-настоящему: реальный запуск сценария, реальный поиск по знаниям и реальный AI-ответ.
        Реальные диалоги и каналы не затрагиваются.{totalTokens > 0 ? ` Израсходовано за сессию: ${totalTokens} токенов.` : ""}
      </p>
      {aiNotReady ? (
        <div className="sandbox-chat-warning" role="status">
          <AlertTriangle size={15} />
          <span>
            {aiReadiness?.status === "not_configured"
              ? "AI-подключение ещё не настроено: бот ответит запасным сообщением и передаст диалог оператору. Подключение настраивает администратор сервиса в разделе «AI»."
              : "AI-подключение сейчас недоступно: бот ответит запасным сообщением и передаст диалог оператору."}
          </span>
        </div>
      ) : null}
      <div className="sandbox-chat-log" ref={logRef} aria-live="polite">
        {entries.length === 0 ? (
          <div className="sandbox-chat-empty">
            <Bot size={19} />
            <span>Напишите боту первое сообщение — например, фразу клиента, на которую сценарий должен сработать.</span>
          </div>
        ) : null}
        {entries.map((entry) => {
          if (entry.kind === "client") {
            return (
              <div className="sandbox-bubble sandbox-bubble--client" key={entry.id}>
                <UserRound size={14} aria-hidden="true" />
                <p>{entry.text}</p>
              </div>
            );
          }
          if (entry.kind === "bot") {
            return (
              <div className="sandbox-bubble sandbox-bubble--bot" key={entry.id}>
                <Bot size={14} aria-hidden="true" />
                <div>
                  <p>{entry.text}</p>
                  {entry.citations?.length ? (
                    <small className="sandbox-citations">
                      Источники: {entry.citations.map((citation) => citation.title).filter(Boolean).join(", ")}
                    </small>
                  ) : null}
                </div>
              </div>
            );
          }
          if (entry.kind === "event") {
            return (
              <div className={`sandbox-event sandbox-event--${entry.eventKind ?? "info"}`} key={entry.id} role="status">
                {entry.note}
              </div>
            );
          }
          const expanded = expandedTraces.has(entry.id);
          const trace = entry.trace;
          return (
            <div className="sandbox-trace" key={entry.id}>
              <button aria-expanded={expanded} onClick={() => toggleTrace(entry.id)} type="button">
                {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                Как бот думал
              </button>
              {expanded ? (
                <dl className="sandbox-trace-details">
                  {trace.trigger?.evaluated ? (
                    <div>
                      <dt>Триггер</dt>
                      <dd>
                        {trace.trigger.matched === true ? "сработал" : trace.trigger.matched === false ? "не сработал бы сам — в тесте сценарий запущен принудительно" : "ручной запуск"}
                        {trace.trigger.matchMode ? ` · режим: ${trace.trigger.matchMode}` : ""}
                      </dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>Шаг</dt>
                    <dd>{trace.nodeType || "—"} · итог: {trace.outcome}</dd>
                  </div>
                  <div>
                    <dt>Поиск по знаниям</dt>
                    <dd>
                      {trace.retrievalPassages?.length
                        ? trace.retrievalPassages.map((passage) => `${passage.title} (${Math.round((passage.score ?? 0) * 100)}%)`).join("; ")
                        : trace.aiCalled ? "фрагменты не понадобились" : "не выполнялся"}
                      {trace.retrievalCache && trace.retrievalCache !== "skipped" ? ` · кэш: ${trace.retrievalCache === "hit" ? "попадание" : "мимо"}` : ""}
                    </dd>
                  </div>
                  <div>
                    <dt>AI</dt>
                    <dd>
                      {trace.aiCalled
                        ? `вызван · модель ${trace.model ?? "—"} · ${trace.usageTokens ?? "?"} токенов · ${trace.latencyMs} мс`
                        : "не вызывался"}
                      {trace.consultationTurns ? ` · реплика консультации №${trace.consultationTurns}` : ""}
                    </dd>
                  </div>
                  {trace.webhook ? (
                    <div>
                      <dt>Webhook</dt>
                      <dd>{trace.webhook.note}</dd>
                    </div>
                  ) : null}
                </dl>
              ) : null}
            </div>
          );
        })}
        {sending ? (
          <div className="sandbox-bubble sandbox-bubble--bot sandbox-bubble--typing" aria-label="Бот печатает">
            <Bot size={14} aria-hidden="true" />
            <p>Бот печатает…</p>
          </div>
        ) : null}
        {handedOff ? (
          <div className="sandbox-event sandbox-event--handoff" role="status">
            Диалог передан оператору. Нажмите «Начать заново», чтобы проверить сценарий ещё раз.
          </div>
        ) : null}
      </div>
      {chatError ? (
        <div className="sandbox-chat-error" role="alert">
          <AlertTriangle size={14} /> {chatError}
        </div>
      ) : null}
      <form className="sandbox-composer" onSubmit={handleSend}>
        <input
          aria-label="Сообщение клиента для теста"
          disabled={!canManage || sending}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void handleSend();
            }
          }}
          placeholder={handedOff ? "Диалог передан оператору — начните заново" : "Напишите сообщение как клиент…"}
          ref={inputRef}
          type="text"
          value={draft}
        />
        <button
          className="primary-action"
          disabled={!canManage || sending || !draft.trim()}
          title={canManage ? "Отправить сообщение боту" : accessReason}
          type="submit"
        >
          <Send size={15} /> Отправить
        </button>
      </form>
      <div className="sandbox-chat-actions">
        <button disabled={!canManage || (entries.length === 0 && !session)} onClick={handleReset} type="button">
          <RotateCcw size={14} /> Начать заново
        </button>
        <button disabled={!canManage || regressionSaved || !entries.some((entry) => entry.kind === "client")} onClick={handleSaveRegression} type="button">
          <Save size={14} /> {regressionSaved ? "Проверка сохранена" : "Сохранить как проверку"}
        </button>
      </div>
    </section>
  );
}
