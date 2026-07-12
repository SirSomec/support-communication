import React from "react";
import { ChannelBadge, SectionTitle } from "../../ui.jsx";

export function ApiGovernancePanel({
  apiChangelog = [],
  apiEnvironmentKeys = [],
  onReplayDelivery,
  onRotateKey,
  onSelectWebhook,
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
      <SectionTitle title="Webhooks / API keys" action="signed delivery, replay, changelog" />
      <div className="api-key-grid">
        {safeApiKeys.map((key) => {
          const isRotated = rotatedKeyIds.includes(key.id);

          return (
            <article className={`api-key-card ${isRotated ? "rotated" : ""}`} key={key.id}>
              <header>
                <span>{key.env}</span>
                <strong>{key.name}</strong>
                <b>{isRotated ? "Rotation queued" : key.status}</b>
              </header>
              <code>{key.keyPreview}</code>
              <p>{key.protection}</p>
              <footer>
                <small>{(key.scopes ?? []).join(", ")}</small>
                <button onClick={() => onRotateKey(key.id)} title="Поставить ключ на ротацию" type="button">
                  Rotate key
                </button>
              </footer>
            </article>
          );
        })}
      </div>

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
                <small>{endpoint.status} · {endpoint.failureRate} failures</small>
              </span>
            </button>
          ))}
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
              <div className="webhook-meta-grid">
                <div><span>Retries</span><strong>{activeWebhook.retries}</strong></div>
                <div><span>Last delivery</span><strong>{activeWebhook.lastDelivery}</strong></div>
                <div><span>Failure rate</span><strong>{activeWebhook.failureRate}</strong></div>
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
                      <button onClick={() => onReplayDelivery(delivery)} title="Повторить доставку" type="button">
                        Replay
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="entity-empty"><strong>Webhook endpoints не настроены</strong></div>
          )}
        </div>
      </div>

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
