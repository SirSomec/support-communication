import { createHash, timingSafeEqual } from "node:crypto";
import { createEnvelope, type BackendEnvelope } from "@support-communication/envelope";
import { createRequestTraceId, getCurrentTraceId } from "@support-communication/observability";

export type PublicApiEnvironment = "production" | "stage";

export interface PublicApiKeyRecord {
  environment: PublicApiEnvironment;
  keyId: string;
  scopes: string[];
  secretHash: string;
  status: "active" | "revoked";
  tenantId: string;
}

export interface PublicApiAuthContext {
  environment: PublicApiEnvironment;
  keyId: string;
  scopes: string[];
  tenantId: string;
}

export interface PublicApiKeyLookup {
  listActiveKeys(): Promise<PublicApiKeyRecord[]> | PublicApiKeyRecord[];
}

export interface PublicApiAuthRequest {
  authorization?: string;
  environment: PublicApiEnvironment;
  lookup: PublicApiKeyLookup;
  requiredScope: string;
}

export interface PublicIdentifyUserRequest {
  authorization?: string;
  environment: PublicApiEnvironment;
  lookup: PublicApiKeyLookup;
  payload: {
    externalId?: string;
    traits?: Record<string, unknown>;
  };
}

export type PublicApiAuthDecision =
  | { allowed: true; context: PublicApiAuthContext }
  | { allowed: false; code: string; status: "denied" | "unauthorized" };

export function hashPublicApiKeySecret(rawSecret: string): string {
  return createHash("sha256").update(rawSecret).digest("hex");
}

export async function resolvePublicApiRequest(request: PublicApiAuthRequest): Promise<PublicApiAuthDecision> {
  const rawSecret = parseBearerSecret(request.authorization);
  if (!rawSecret) {
    return deny("public_api_key_required", "unauthorized");
  }

  const secretHash = hashPublicApiKeySecret(rawSecret);
  const activeKeys = (await request.lookup.listActiveKeys()).filter((key) => key.status === "active");
  const matchedKey = activeKeys.find((key) => safeEqualHex(key.secretHash, secretHash));
  if (!matchedKey) {
    return deny("public_api_key_invalid", "unauthorized");
  }

  if (matchedKey.environment !== request.environment) {
    return deny("public_api_key_environment_mismatch", "denied");
  }

  if (!matchedKey.scopes.includes(request.requiredScope)) {
    return deny("public_api_scope_denied", "denied");
  }

  return {
    allowed: true,
    context: {
      environment: matchedKey.environment,
      keyId: matchedKey.keyId,
      scopes: [...matchedKey.scopes],
      tenantId: matchedKey.tenantId
    }
  };
}

export async function handlePublicIdentifyUserRequest(
  request: PublicIdentifyUserRequest
): Promise<BackendEnvelope<Record<string, unknown>>> {
  const auth = await resolvePublicApiRequest({
    authorization: request.authorization,
    environment: request.environment,
    lookup: request.lookup,
    requiredScope: "clients:identify"
  });

  if (!auth.allowed) {
    return createEnvelope({
      service: "integrationService",
      operation: "identifyPublicClient",
      status: "denied",
      traceId: publicApiTraceId("identifyPublicClient"),
      meta: apiMeta({ environment: request.environment }),
      data: {
        context: null,
        rateLimit: publicApiRateLimit(),
        rawKeyExposed: false
      },
      error: {
        code: auth.code,
        message: publicApiAuthMessage(auth.code)
      }
    });
  }

  return createEnvelope({
    service: "integrationService",
    operation: "identifyPublicClient",
    traceId: publicApiTraceId("identifyPublicClient"),
    meta: apiMeta({ environment: request.environment }),
    data: {
      accepted: true,
      acceptedEnvironment: auth.context.environment,
      acceptedTenantId: auth.context.tenantId,
      context: auth.context,
      externalId: request.payload.externalId ?? null,
      rateLimit: publicApiRateLimit(),
      rejectedPayloadContextFields: rejectedPayloadContextFields(request.payload.traits),
      rawKeyExposed: false,
      traitsAccepted: acceptedTraitKeys(request.payload.traits).length > 0
    }
  });
}

function parseBearerSecret(authorization?: string): string | null {
  const value = String(authorization ?? "").trim();
  const match = /^Bearer\s+(.+)$/i.exec(value);
  return match?.[1]?.trim() || null;
}

function deny(code: string, status: "denied" | "unauthorized"): PublicApiAuthDecision {
  return { allowed: false, code, status };
}

function safeEqualHex(left: string, right: string): boolean {
  if (!/^[a-f0-9]+$/i.test(left) || !/^[a-f0-9]+$/i.test(right) || left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function apiMeta(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    source: "api",
    apiVersion: "v1",
    ...extra
  };
}

function publicApiRateLimit(): Record<string, unknown> {
  return {
    limit: 60,
    policy: "public-api-default",
    remaining: 59,
    resetSeconds: 60
  };
}

function publicApiTraceId(operation: string): string {
  return getCurrentTraceId() ?? createRequestTraceId("integrationService", operation);
}

function rejectedPayloadContextFields(traits: Record<string, unknown> | undefined): string[] {
  if (!traits) {
    return [];
  }

  return ["environment", "tenantId"].filter((field) => Object.prototype.hasOwnProperty.call(traits, field));
}

function acceptedTraitKeys(traits: Record<string, unknown> | undefined): string[] {
  if (!traits) {
    return [];
  }

  const rejected = new Set(rejectedPayloadContextFields(traits));
  return Object.keys(traits).filter((field) => !rejected.has(field));
}

function publicApiAuthMessage(code: string): string {
  return code === "public_api_key_required"
    ? "Bearer public API key is required."
    : code === "public_api_key_invalid"
      ? "Public API key is invalid."
      : code === "public_api_key_environment_mismatch"
        ? "Public API key is not valid for this environment."
        : "Public API key does not include the required scope.";
}
