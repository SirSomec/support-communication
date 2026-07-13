import { integrationService } from "../services/integrationService.js";

export async function submitApiKeyRotation(keyId, service = integrationService) {
  const normalizedKeyId = stringValue(keyId);
  if (!normalizedKeyId) {
    return failure("Не указан идентификатор API-ключа.");
  }

  try {
    const response = await service.rotateApiKey(normalizedKeyId);
    if (response.status !== "ok") {
      return failure(response.error?.message ?? "Сервер не принял ротацию API-ключа.");
    }

    const data = response.data ?? {};
    if (
      stringValue(data.keyId) !== normalizedKeyId
      || stringValue(data.rotationId) === ""
      || stringValue(data.auditId) === ""
      || data.status !== "rotation_queued"
      || data.rawKeyShownOnce !== false
    ) {
      return failure("Ротация API-ключа не подтверждена бэкендом.");
    }

    return {
      auditId: data.auditId,
      keyId: normalizedKeyId,
      message: `${normalizedKeyId}: ротация ключа поставлена в очередь. Аудит ${data.auditId}.`,
      ok: true,
      rotationId: data.rotationId
    };
  } catch (error) {
    return failure(errorMessage(error, "Не удалось выполнить запрос ротации API-ключа."));
  }
}

export async function submitWebhookReplay(delivery, service = integrationService) {
  const deliveryId = stringValue(delivery?.id ?? delivery?.deliveryId);
  if (!deliveryId) {
    return failure("Не указан идентификатор доставки вебхука.");
  }

  try {
    const response = await service.replayWebhookDelivery(delivery);
    if (response.status !== "ok") {
      return failure(response.error?.message ?? "Сервер не принял повтор доставки вебхука.");
    }

    const data = response.data ?? {};
    if (
      stringValue(data.deliveryId) !== deliveryId
      || stringValue(data.replayId) === ""
      || stringValue(data.auditId) === ""
      || data.status !== "replay_queued"
    ) {
      return failure("Повтор доставки вебхука не подтверждён бэкендом.");
    }

    return {
      auditId: data.auditId,
      deliveryId,
      message: `${stringValue(delivery?.traceId) || deliveryId}: повтор доставки поставлен в очередь. Аудит ${data.auditId}.`,
      ok: true,
      replayId: data.replayId
    };
  } catch (error) {
    return failure(errorMessage(error, "Не удалось выполнить запрос повтора доставки вебхука."));
  }
}

export async function submitSecuritySessionRevoke(sessionId, service = integrationService) {
  const normalizedSessionId = stringValue(sessionId);
  if (!normalizedSessionId) {
    return failure("Не указан идентификатор сессии.");
  }

  try {
    const response = await service.revokeSecuritySession(normalizedSessionId);
    if (response.status !== "ok") {
      return failure(response.error?.message ?? "Сервер не принял отзыв сессии.");
    }

    const data = response.data ?? {};
    if (
      stringValue(data.sessionId) !== normalizedSessionId
      || stringValue(data.auditId) === ""
      || stringValue(data.revokedAt) === ""
      || data.status !== "revoked"
    ) {
      return failure("Отзыв сессии не подтверждён бэкендом.");
    }

    return {
      auditId: data.auditId,
      message: `${normalizedSessionId}: сессия отозвана. Аудит безопасности ${data.auditId}.`,
      ok: true,
      sessionId: normalizedSessionId
    };
  } catch (error) {
    return failure(errorMessage(error, "Не удалось выполнить запрос отзыва сессии."));
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
