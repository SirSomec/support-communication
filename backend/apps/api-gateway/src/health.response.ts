import { type BackendConfig } from "@support-communication/config";
import { createEnvelope, type BackendEnvelope } from "@support-communication/envelope";
import { createRequestTraceId, getCurrentTraceId } from "@support-communication/observability";

interface DependencyStatus {
  configured: boolean;
  mode: "configuration";
}

export interface HealthResponse {
  service: string;
  status: "ok";
  version: string;
  dependencies: {
    database: DependencyStatus;
    redis: DependencyStatus;
    objectStorage: DependencyStatus;
    mail: DependencyStatus;
  };
}

export interface ReadinessResponse {
  service: string;
  status: "ready";
  version: string;
}

const SERVICE = "api-gateway";

export function buildHealthEnvelope(config: BackendConfig, requestId?: string): BackendEnvelope<HealthResponse> {
  const traceId = requestId ?? getCurrentTraceId() ?? createRequestTraceId(SERVICE, "health");

  return createEnvelope({
    service: SERVICE,
    operation: "health",
    traceId,
    meta: {
      apiVersion: config.API_VERSION,
      source: "api"
    },
    data: {
      service: SERVICE,
      status: "ok",
      version: config.API_VERSION,
      dependencies: {
        database: { configured: Boolean(config.DATABASE_URL), mode: "configuration" },
        redis: { configured: Boolean(config.REDIS_URL), mode: "configuration" },
        objectStorage: { configured: hasObjectStorageConfig(config), mode: "configuration" },
        mail: { configured: Boolean(config.MAIL_HOST), mode: "configuration" }
      }
    }
  });
}

function hasObjectStorageConfig(config: BackendConfig): boolean {
  return Boolean(
    config.S3_ACCESS_KEY
    && config.S3_BUCKET
    && config.S3_ENDPOINT
    && config.S3_REGION
    && config.S3_SECRET_KEY
  );
}

export function buildReadinessEnvelope(config: BackendConfig, requestId?: string): BackendEnvelope<ReadinessResponse> {
  const traceId = requestId ?? getCurrentTraceId() ?? createRequestTraceId(SERVICE, "ready");

  return createEnvelope({
    service: SERVICE,
    operation: "ready",
    traceId,
    meta: {
      apiVersion: config.API_VERSION,
      source: "api"
    },
    data: {
      service: SERVICE,
      status: "ready",
      version: config.API_VERSION
    }
  });
}
