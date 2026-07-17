import React from "react";
import { Pencil, PlayCircle, PauseCircle, Trash2 } from "lucide-react";
import { ChannelBadge, SectionTitle } from "../../ui.jsx";

export function isEndpointDisabled(endpoint) {
  const status = String(endpoint?.status ?? "").trim().toLowerCase();

  return status === "отключён" || status === "отключен" || status === "disabled";
}

export function ApiGovernancePanel({
  apiChangelog = [],
  apiEnvironmentKeys = [],
  busy = "",
  onDeleteEndpoint,
  onEditEndpoint,
  onReplayDelivery,
  onRevokeKey,
  onRotateKey,
  onSelectWebhook,
  onToggleEndpoint,
  replayedDeliveryIds = [],
  rotatedKeyIds = [],
  selectedWebhook,
  visibleWebhookDeliveries = [],
  webhookEndpoints = []
}) {
  const safeApiKeys = apiEnvironmentKeys.filter(Boolean);
  const safeEndpoints = webhookEndpoints.filter(Boolean);
  const safeDeliveries = visibleWebhookDeliveries.filter(Boolean);
  const safeChangelog = apiChangelog.filter(Boolean);
  const activeWebhook = selectedWebhook ?? safeEndpoints[0] ?? null;

  return (
    <section className="work-panel api-governance-panel">
      <SectionTitle title="API-ключи" action="создание, ротация и отзыв" />
      <div className="api-key-grid">
        {safeApiKeys.map((key) => {
          const isRotated = rotatedKeyIds.includes(key.id);
          const isRevoked = String(key.status).toLowerCase() === "revoked";

          return (
            <article className={`api-key-card ${isRotated ? "rotated" : ""} ${isRevoked ? "revoked" : ""}`} key={key.id}>
              <header>
                <span>{key.env}</span>
                <strong>{key.name}</strong>
                <b>{isRotated ? "Ротация в очереди" : keyStatusLabel(key.status)}</b>
              </header>
              <code>{key.keyPreview}</code>
              <p>{key.protection}</p>
              <footer>
                <small>{(key.scopes ?? []).join(", ")}</small>
                <span className="api-key-actions">
                  <button
                    className="api-key-rotate"
                    disabled={isRevoked || Boolean(busy)}
                    onClick={() => onRotateKey(key.id)}
                    title="Поставить ключ на ротацию"
                    type="button"
                  >
                    Ротация
                  </button>
                  <button
                    className="api-key-revoke"
                    disabled={isRevoked || Boolean(busy)}
                    onClick={() => onRevokeKey(key)}
                    title="Отозвать ключ — запросы перестанут приниматься"
                    type="button"
                  >
                    Отозвать
                  </button>
                </span>
              </footer>
            </article>
          );
        })}
        {!safeApiKeys.length ? (
          <div className="entity-empty">
            <strong>API-ключи не созданы</strong>
            <span>Создайте ключ, чтобы внешние системы могли обращаться к публичному API.</span>
          </div>
        ) : null}
      </div>

      <SectionTitle title="Webhook endpoints" action="подписанные доставки и повторы" />
      <div className="webhook-workspace">
        <div className="webhook-endpoint-list">
          {safeEndpoints.map((endpoint) => (
            <button
              aria-pressed={activeWebhook?.id === endpoint.id}
              className={`webhook-endpoint ${activeWebhook?.id === endpoint.id ? "selected" : ""}`}
              key={endpoint.id}
              onClick={() => onSelectWebhook(endpoint.id)}
              type="button"
            >
              <ChannelBadge channel={endpoint.channel} />
              <span>
                <strong>{endpoint.name}</strong>
                <small>{endpoint.status} · {endpoint.failureRate} ошибок</small>
              </span>
            </button>
          ))}
          {!safeEndpoints.length ? (
            <div className="entity-empty">
              <strong>Webhook endpoints не настроены</strong>
              <span>Добавьте endpoint, чтобы получать события о диалогах во внешней системе.</span>
            </div>
          ) : null}
        </div>

        <div className="webhook-detail">
          {activeWebhook ? (
            <>
              <header>
                <div>
                  <strong>{activeWebhook.name}</strong>
                  <span>{activeWebhook.url}</span>
                </div>
                <b>{activeWebhook.signature}</b>
              </header>
              <div className="webhook-endpoint-actions">
                <button
                  className="webhook-endpoint-edit"
                  disabled={Boolean(busy)}
                  onClick={() => onEditEndpoint(activeWebhook)}
                  title="Изменить название или URL"
                  type="button"
                >
                  <Pencil size={14} />
                  Изменить
                </button>
                <button
                  className="webhook-endpoint-toggle"
                  disabled={Boolean(busy)}
                  onClick={() => onToggleEndpoint(activeWebhook)}
                  title={isEndpointDisabled(activeWebhook) ? "Возобновить доставку событий" : "Приостановить доставку событий"}
                  type="button"
                >
                  {isEndpointDisabled(activeWebhook) ? <PlayCircle size={14} /> : <PauseCircle size={14} />}
                  {isEndpointDisabled(activeWebhook) ? "Включить" : "Отключить"}
                </button>
                <button
                  className="webhook-endpoint-delete"
                  disabled={Boolean(busy)}
                  onClick={() => onDeleteEndpoint(activeWebhook)}
                  title="Удалить endpoint"
                  type="button"
                >
                  <Trash2 size={14} />
                  Удалить
                </button>
              </div>
              <div className="webhook-meta-grid">
                <div><span>Повторы</span><strong>{activeWebhook.retries}</strong></div>
                <div><span>Последняя доставка</span><strong>{activeWebhook.lastDelivery}</strong></div>
                <div><span>Ошибки</span><strong>{activeWebhook.failureRate}</strong></div>
              </div>
              <div className="webhook-delivery-log">
                {safeDeliveries.map((delivery) => {
                  const isReplayed = replayedDeliveryIds.includes(delivery.id);

                  return (
                    <div className={`webhook-delivery-row ${delivery.status}`} key={delivery.id}>
                      <time>{delivery.time}</time>
                      <span>
                        <strong>{delivery.event}</strong>
                        <small>{delivery.traceId}</small>
                      </span>
                      <b>{isReplayed ? "replay_queued" : delivery.status}</b>
                      <span>{delivery.httpStatus} · {delivery.attempts} попытки</span>
                      <button disabled={Boolean(busy)} onClick={() => onReplayDelivery(delivery)} title="Повторить доставку" type="button">
                        Повторить
                      </button>
                    </div>
                  );
                })}
                {!safeDeliveries.length ? (
                  <div className="entity-empty"><strong>Доставок по endpoint'у пока не было</strong></div>
                ) : null}
              </div>
            </>
          ) : (
            <div className="entity-empty"><strong>Выберите endpoint или добавьте новый</strong></div>
          )}
        </div>
      </div>

      <SectionTitle title="Changelog API" action="изменения контрактов" />
      <div className="api-changelog">
        {safeChangelog.map((entry) => (
          <article key={entry.version}>
            <b>{entry.version}</b>
            <span>
              <strong>{entry.title}</strong>
              <small>{entry.detail}</small>
            </span>
          </article>
        ))}
      </div>
    </section>
  );
}

function keyStatusLabel(status) {
  const normalized = String(status ?? "").toLowerCase();
  if (normalized === "revoked") {
    return "Отозван";
  }

  if (normalized === "active") {
    return "Активен";
  }

  return status;
}
