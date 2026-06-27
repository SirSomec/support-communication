import React, { useEffect, useState } from "react";
import { Activity, ServerCog } from "lucide-react";
import { SectionTitle, StatusBadge } from "../../ui.jsx";
import { backendIntegrationService } from "../../services/index.js";

export function BackendIntegrationPanel() {
  const [snapshot, setSnapshot] = useState(null);

  useEffect(() => {
    let isMounted = true;

    backendIntegrationService.fetchBackendIntegrationSnapshot().then((response) => {
      if (isMounted) {
        setSnapshot(response);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const services = snapshot?.data?.services ?? [];
  const readyCount = services.filter((service) => service.status === "ready").length;
  const partialCount = services.filter((service) => service.status === "partial").length;

  return (
    <section className="work-panel backend-integration-panel">
      <SectionTitle title="Backend integration" action={snapshot ? `${readyCount} ready / ${partialCount} partial` : "loading adapters"} />
      <div className="backend-integration-summary">
        <span>
          <ServerCog size={18} />
          <strong>{snapshot?.status ?? "loading"}</strong>
          <small>{snapshot?.traceId ?? "waiting for mock backend envelope"}</small>
        </span>
        <span>
          <Activity size={18} />
          <strong>{snapshot?.partial ? "partial states enabled" : "full state pending"}</strong>
          <small>{snapshot?.data?.contract?.states?.join(", ") ?? "loading, empty, error, partial"}</small>
        </span>
      </div>
      <div className="backend-service-grid">
        {services.map((service) => (
          <article className={`backend-service-card ${service.status}`} data-service-id={service.id} key={service.id}>
            <header>
              <strong>{service.id}</strong>
              <StatusBadge tone={service.status === "ready" ? "ok" : "hold"}>{service.status}</StatusBadge>
            </header>
            <code>{service.traceId}</code>
            <p>{service.note ?? "Adapter exposes backend-ready envelope and UI states."}</p>
            <footer>
              {service.operations.map((operation) => <span key={operation}>{operation}</span>)}
            </footer>
          </article>
        ))}
        {!services.length ? (
          <article className="backend-service-card loading">
            <header>
              <strong>service adapters</strong>
              <StatusBadge tone="hold">loading</StatusBadge>
            </header>
            <code>trc_pending</code>
            <p>Waiting for mock backend envelope.</p>
          </article>
        ) : null}
      </div>
    </section>
  );
}
