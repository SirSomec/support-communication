import { integrationService } from "../services/integrationService.js";

export async function submitApiKeyRotation(keyId, service = integrationService) {
  const normalizedKeyId = stringValue(keyId);
  if (!normalizedKeyId) {
    return failure("API key id is required.");
  }

  try {
    const response = await service.rotateApiKey(normalizedKeyId);
    if (response.status !== "ok") {
      return failure(response.error?.message ?? "API key rotation was rejected by the backend.");
    }

    const data = response.data ?? {};
    if (
      stringValue(data.keyId) !== normalizedKeyId
      || stringValue(data.rotationId) === ""
      || stringValue(data.auditId) === ""
      || data.status !== "rotation_queued"
      || data.rawKeyShownOnce !== false
    ) {
      return failure("API key rotation evidence is incomplete.");
    }

    return {
      auditId: data.auditId,
      keyId: normalizedKeyId,
      message: `${normalizedKeyId}: API key rotation queued, audit ${data.auditId}.`,
      ok: true,
      rotationId: data.rotationId
    };
  } catch (error) {
    return failure(errorMessage(error, "API key rotation request failed."));
  }
}

export async function submitWebhookReplay(delivery, service = integrationService) {
  const deliveryId = stringValue(delivery?.id ?? delivery?.deliveryId);
  if (!deliveryId) {
    return failure("Webhook delivery id is required.");
  }

  try {
    const response = await service.replayWebhookDelivery(delivery);
    if (response.status !== "ok") {
      return failure(response.error?.message ?? "Webhook replay was rejected by the backend.");
    }

    const data = response.data ?? {};
    if (
      stringValue(data.deliveryId) !== deliveryId
      || stringValue(data.replayId) === ""
      || stringValue(data.auditId) === ""
      || data.status !== "replay_queued"
    ) {
      return failure("Webhook replay evidence is incomplete.");
    }

    return {
      auditId: data.auditId,
      deliveryId,
      message: `${stringValue(delivery?.traceId) || deliveryId}: manual replay queued, audit ${data.auditId}.`,
      ok: true,
      replayId: data.replayId
    };
  } catch (error) {
    return failure(errorMessage(error, "Webhook replay request failed."));
  }
}

export async function submitSecuritySessionRevoke(sessionId, service = integrationService) {
  const normalizedSessionId = stringValue(sessionId);
  if (!normalizedSessionId) {
    return failure("Security session id is required.");
  }

  try {
    const response = await service.revokeSecuritySession(normalizedSessionId);
    if (response.status !== "ok") {
      return failure(response.error?.message ?? "Security session revoke was rejected by the backend.");
    }

    const data = response.data ?? {};
    if (
      stringValue(data.sessionId) !== normalizedSessionId
      || stringValue(data.auditId) === ""
      || stringValue(data.revokedAt) === ""
      || data.status !== "revoked"
    ) {
      return failure("Security session revoke evidence is incomplete.");
    }

    return {
      auditId: data.auditId,
      message: `${normalizedSessionId}: security session revoked, security audit ${data.auditId}.`,
      ok: true,
      sessionId: normalizedSessionId
    };
  } catch (error) {
    return failure(errorMessage(error, "Security session revoke request failed."));
  }
}

function failure(message) {
  return {
    message,
    ok: false
  };
}

function stringValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function errorMessage(error, fallback) {
  return error instanceof Error ? error.message : fallback;
}
