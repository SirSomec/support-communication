import { type BackendConfig } from "@support-communication/config";
import { createEnvelope, type BackendEnvelope } from "@support-communication/envelope";
import { createRequestTraceId, getCurrentTraceId } from "@support-communication/observability";
import { connect } from "node:net";

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
  status: "ready" | "unready";
  version: string;
  dependencies?: Record<string, { status: "up" | "down" }>;
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

export function buildReadinessEnvelope(config: BackendConfig, requestId?: string, dependencies?: Record<string, { status: "up" | "down" }>): BackendEnvelope<ReadinessResponse> {
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
      status: dependencies && Object.values(dependencies).some((dependency) => dependency.status === "down") ? "unready" : "ready",
      ...(dependencies ? { dependencies } : {}),
      version: config.API_VERSION
    }
  });
}

export async function checkRuntimeDependencies(config: BackendConfig, timeoutMs = 2_000): Promise<Record<string, { status: "up" | "down" }>> {
  const checks = await Promise.all([
    dependency("database", () => tcpProbe(config.DATABASE_URL, 5432, timeoutMs)),
    dependency("redis", () => tcpProbe(config.REDIS_URL, 6379, timeoutMs)),
    dependency("objectStorage", () => httpProbe(config.S3_ENDPOINT, "/minio/health/ready", timeoutMs)),
    dependency("mail", () => tcpProbe(`tcp://${config.MAIL_HOST}:${config.MAIL_PORT}`, 25, timeoutMs))
  ]);
  return Object.fromEntries(checks);
}

async function dependency(name: string, check: () => Promise<void>): Promise<[string, { status: "up" | "down" }]> {
  try { await check(); return [name, { status: "up" }]; }
  catch { return [name, { status: "down" }]; }
}

function tcpProbe(value: string | undefined, defaultPort: number, timeoutMs: number): Promise<void> {
  if (!value) return Promise.reject(new Error("dependency_not_configured"));
  const url = new URL(value.includes("://") ? value : `tcp://${value}`);
  return new Promise((resolve, reject) => {
    const socket = connect({ host: url.hostname, port: Number(url.port) || defaultPort });
    const timer = setTimeout(() => socket.destroy(new Error("dependency_timeout")), timeoutMs);
    socket.once("connect", () => { clearTimeout(timer); socket.end(); resolve(); });
    socket.once("error", (error) => { clearTimeout(timer); reject(error); });
  });
}

async function httpProbe(endpoint: string | undefined, path: string, timeoutMs: number): Promise<void> {
  if (!endpoint) throw new Error("dependency_not_configured");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${endpoint.replace(/\/+$/, "")}${path}`, { signal: controller.signal });
    if (!response.ok) throw new Error(`dependency_http_${response.status}`);
  } finally { clearTimeout(timer); }
}
