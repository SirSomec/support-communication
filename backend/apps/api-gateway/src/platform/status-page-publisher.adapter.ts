import { createHash } from "node:crypto";
import { redactSensitiveText } from "@support-communication/redaction";
import type {
  CustomerVisibleIncidentCommunicationPlan,
  IncidentCommunicationSyncJob
} from "../incidents/incident-communication.worker.js";
import type {
  PlatformOutboxRow
} from "./platform.repository.js";

export type StatusPagePublishScope = "component-alert" | "incident-update";

export interface StatusPagePublishBody {
  componentId?: string;
  componentName?: string;
  customerMessage?: string;
  incidentId?: string;
  public: boolean;
  reason?: string | null;
  severity?: string;
  status: string;
  tenantNamesExposed: false;
  updateText?: string;
}

export interface StatusPagePublishRequest {
  body: StatusPagePublishBody;
  externalIdempotencyKey: string;
  scope: StatusPagePublishScope;
  target: string;
  traceId: string;
}

export interface StatusPagePublishResult {
  externalId: string;
  externalIdempotencyKey: string;
  ok: boolean;
  providerStatusCode?: number;
  publishedAt: string;
  sanitizedFailure?: string;
}

export interface StatusPagePublisherPort {
  publish(request: StatusPagePublishRequest): Promise<StatusPagePublishResult>;
}

export interface PublishIncidentStatusPageCommunicationInput {
  job: IncidentCommunicationSyncJob;
  now?: string;
  plan: CustomerVisibleIncidentCommunicationPlan;
  publisher: StatusPagePublisherPort;
  traceId?: string;
}

export interface PublishPlatformAlertStatusPageCommunicationInput {
  component: {
    id: string;
    name: string;
    status: string;
  };
  now?: string;
  publisher: StatusPagePublisherPort;
  reason?: string | null;
  statusPageSync: {
    id: string;
    queue: string;
    scope: string;
    target: string;
  };
  traceId: string;
}

export interface ExecuteStatusPageSyncOutboxWorkerInput {
  now?: string;
  outbox: PlatformOutboxRow;
  publisher: StatusPagePublisherPort;
  repository: {
    updatePlatformOutboxRowStatusAsync(
      idempotencyKey: string,
      status: string,
      payloadPatch?: Record<string, unknown>
    ): Promise<PlatformOutboxRow>;
  };
}

export interface ExecuteStatusPageSyncOutboxWorkerResult {
  outbox: PlatformOutboxRow;
  publishResult: StatusPagePublishResult;
  status: "published" | "retry_scheduled";
}

export interface DeterministicStatusPagePublisherAdapterOptions {
  responses?: Map<string, StatusPagePublishResult>;
}

export interface RuntimeHttpStatusPagePublisherAdapterOptions {
  apiKey?: string;
  endpoint: string;
  fetch?: typeof fetch;
}

export function buildStatusPageExternalIdempotencyKey(scope: StatusPagePublishScope, target: string): string {
  return `status-page:${scope}:${target}`;
}

export function sanitizeStatusPagePublisherFailure(error: unknown): string {
  if (error instanceof Error) {
    return redactSensitiveText(error.message);
  }

  return redactSensitiveText(String(error));
}

export function createDeterministicStatusPagePublisherAdapter(
  options: DeterministicStatusPagePublisherAdapterOptions = {}
): StatusPagePublisherPort {
  return {
    async publish(request) {
      const configured = options.responses?.get(request.externalIdempotencyKey);
      if (configured) {
        return {
          ...configured,
          externalIdempotencyKey: request.externalIdempotencyKey
        };
      }

      return {
        externalId: makeDeterministicExternalId(request.target, request.scope),
        externalIdempotencyKey: request.externalIdempotencyKey,
        ok: true,
        providerStatusCode: 202,
        publishedAt: new Date().toISOString()
      };
    }
  };
}

export function createRuntimeHttpStatusPagePublisherAdapter(
  options: RuntimeHttpStatusPagePublisherAdapterOptions
): StatusPagePublisherPort {
  const endpoint = options.endpoint.replace(/\/+$/, "");

  return {
    async publish(request) {
      const publishedAt = new Date().toISOString();
      const headers: Record<string, string> = {
        "content-type": "application/json",
        "idempotency-key": request.externalIdempotencyKey,
        "trace-id": request.traceId
      };
      if (options.apiKey) {
        headers.authorization = `Bearer ${options.apiKey}`;
      }

      try {
        const fetcher = options.fetch ?? fetch;
        const response = await fetcher(endpoint, {
          body: JSON.stringify(request.body),
          headers,
          method: "POST"
        });
        const responseBody = await response.text();
        let externalId = makeDeterministicExternalId(request.target, request.scope);
        if (responseBody) {
          try {
            const parsed = JSON.parse(responseBody) as { id?: unknown };
            if (typeof parsed.id === "string" && parsed.id.length > 0) {
              externalId = parsed.id;
            }
          } catch {
            // keep deterministic fallback id
          }
        }

        if (!response.ok) {
          return {
            externalId,
            externalIdempotencyKey: request.externalIdempotencyKey,
            ok: false,
            providerStatusCode: response.status,
            publishedAt,
            sanitizedFailure: sanitizeStatusPagePublisherFailure(`status-page provider returned ${response.status}`)
          };
        }

        return {
          externalId,
          externalIdempotencyKey: request.externalIdempotencyKey,
          ok: true,
          providerStatusCode: response.status,
          publishedAt
        };
      } catch (error) {
        return {
          externalId: makeDeterministicExternalId(request.target, request.scope),
          externalIdempotencyKey: request.externalIdempotencyKey,
          ok: false,
          publishedAt,
          sanitizedFailure: sanitizeStatusPagePublisherFailure(error)
        };
      }
    }
  };
}

export async function publishIncidentStatusPageCommunication(
  input: PublishIncidentStatusPageCommunicationInput
): Promise<StatusPagePublishResult> {
  if (input.job.queue !== "status-page-sync" || input.job.scope !== "incident-update") {
    throw new Error("status_page_incident_job_invalid");
  }

  if (input.job.target !== input.plan.descriptor.incidentId) {
    throw new Error("status_page_incident_target_mismatch");
  }

  const publishedAt = input.now ?? new Date().toISOString();
  const publisher = withPublishedAt(input.publisher, publishedAt);
  return publisher.publish({
    body: {
      customerMessage: input.plan.descriptor.payload.customerMessage,
      incidentId: input.plan.descriptor.incidentId,
      public: true,
      severity: input.plan.descriptor.payload.severity,
      status: input.plan.descriptor.payload.status,
      tenantNamesExposed: false,
      updateText: input.plan.descriptor.payload.updateText
    },
    externalIdempotencyKey: buildStatusPageExternalIdempotencyKey("incident-update", input.plan.descriptor.incidentId),
    scope: "incident-update",
    target: input.plan.descriptor.incidentId,
    traceId: input.traceId ?? input.plan.descriptor.traceId
  });
}

export async function publishPlatformAlertStatusPageCommunication(
  input: PublishPlatformAlertStatusPageCommunicationInput
): Promise<StatusPagePublishResult> {
  if (input.statusPageSync.queue !== "status-page-sync" || input.statusPageSync.scope !== "component-alert") {
    throw new Error("status_page_alert_job_invalid");
  }

  if (input.statusPageSync.target !== input.component.id) {
    throw new Error("status_page_alert_target_mismatch");
  }

  const publishedAt = input.now ?? new Date().toISOString();
  const publisher = withPublishedAt(input.publisher, publishedAt);
  return publisher.publish({
    body: {
      componentId: input.component.id,
      componentName: input.component.name,
      public: true,
      reason: input.reason ?? null,
      status: input.component.status,
      tenantNamesExposed: false
    },
    externalIdempotencyKey: buildStatusPageExternalIdempotencyKey("component-alert", input.component.id),
    scope: "component-alert",
    target: input.component.id,
    traceId: input.traceId
  });
}

export async function executeStatusPageSyncOutboxWorker(
  input: ExecuteStatusPageSyncOutboxWorkerInput
): Promise<ExecuteStatusPageSyncOutboxWorkerResult> {
  if (input.outbox.queue !== "status-page-sync") {
    throw new Error("status_page_outbox_queue_unsupported");
  }

  const request = statusPageRequestFromOutbox(input.outbox);
  const publishedAt = input.now ?? new Date().toISOString();
  const publishResult = await withPublishedAt(input.publisher, publishedAt).publish(request);
  const status = publishResult.ok ? "published" : "retry_scheduled";
  const outbox = await input.repository.updatePlatformOutboxRowStatusAsync(input.outbox.idempotencyKey, status, {
    statusPagePublish: publishResult
  });

  return {
    outbox,
    publishResult,
    status
  };
}

function statusPageRequestFromOutbox(outbox: PlatformOutboxRow): StatusPagePublishRequest {
  if (outbox.type === "platform.alert.status_page.requested") {
    return {
      body: {
        componentId: String(outbox.payload.componentId ?? outbox.target),
        componentName: typeof outbox.payload.componentName === "string"
          ? outbox.payload.componentName
          : String(outbox.payload.componentId ?? outbox.target),
        public: true,
        reason: typeof outbox.payload.reason === "string" ? outbox.payload.reason : null,
        status: String(outbox.payload.status ?? outbox.payload.componentStatus ?? "unknown"),
        tenantNamesExposed: false
      },
      externalIdempotencyKey: outbox.idempotencyKey,
      scope: "component-alert",
      target: outbox.target,
      traceId: outbox.traceId
    };
  }

  if (outbox.type === "platform.incident.status_page.requested") {
    const message = String(outbox.payload.message ?? outbox.payload.updateText ?? "");
    return {
      body: {
        customerMessage: message,
        incidentId: String(outbox.payload.incidentId ?? outbox.target),
        public: true,
        severity: typeof outbox.payload.severity === "string" ? outbox.payload.severity : undefined,
        status: String(outbox.payload.status ?? "unknown"),
        tenantNamesExposed: false,
        updateText: message
      },
      externalIdempotencyKey: outbox.idempotencyKey,
      scope: "incident-update",
      target: outbox.target,
      traceId: outbox.traceId
    };
  }

  throw new Error(`status_page_outbox_type_unsupported:${outbox.type}`);
}

function withPublishedAt(publisher: StatusPagePublisherPort, publishedAt: string): StatusPagePublisherPort {
  if (!(publisher instanceof Object) || !("publish" in publisher)) {
    return publisher;
  }

  return {
    async publish(request) {
      const result = await publisher.publish(request);
      return {
        ...result,
        publishedAt
      };
    }
  };
}

function makeDeterministicExternalId(target: string, scope: StatusPagePublishScope): string {
  return `status_page_external_${sanitizeIdentifierSegment(target)}_${createHash("sha256")
    .update(`${scope}:${target}`)
    .digest("hex")
    .slice(0, 12)}`;
}

function sanitizeIdentifierSegment(value: string): string {
  return value.replace(/[^a-z0-9_]+/gi, "_");
}
