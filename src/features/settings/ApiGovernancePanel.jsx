import React from "react";
import { ChannelBadge, SectionTitle } from "../../ui.jsx";

export function ApiGovernancePanel({
  apiChangelog,
  apiEnvironmentKeys,
  onReplayDelivery,
  onRotateKey,
  onSelectWebhook,
  replayedDeliveryIds,
  rotatedKeyIds,
  selectedWebhook,
  visibleWebhookDeliveries,
  webhookEndpoints
}) {
  return (
    <section className="work-panel api-governance-panel">
      <SectionTitle title="Webhooks / API keys" action="signed delivery, replay, changelog" />
      <div className="api-key-grid">
        {apiEnvironmentKeys.map((key) => {
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
                <small>{key.scopes.join(", ")}</small>
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
          {webhookEndpoints.map((endpoint) => (
            <button
              aria-pressed={selectedWebhook.id === endpoint.id}
              className={`webhook-endpoint ${selectedWebhook.id === endpoint.id ? "selected" : ""}`}
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
          <header>
            <div>
              <strong>{selectedWebhook.name}</strong>
              <span>{selectedWebhook.url}</span>
            </div>
            <b>{selectedWebhook.signature}</b>
          </header>
          <div className="webhook-meta-grid">
            <div><span>Retries</span><strong>{selectedWebhook.retries}</strong></div>
            <div><span>Last delivery</span><strong>{selectedWebhook.lastDelivery}</strong></div>
            <div><span>Failure rate</span><strong>{selectedWebhook.failureRate}</strong></div>
          </div>
          <div className="webhook-delivery-log">
            {visibleWebhookDeliveries.map((delivery) => {
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
        </div>
      </div>

      <div className="api-changelog">
        {apiChangelog.map((entry) => (
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
