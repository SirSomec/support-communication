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

export async function submitApiKeyCreate(form, service = integrationService) {
  const name = stringValue(form?.name);
  if (!name) {
    return failure("Укажите название ключа.");
  }

  try {
    const response = await service.createApiKey({
      environment: stringValue(form?.environment) || "stage",
      name,
      scopes: parseScopes(form?.scopes)
    });
    if (response.status !== "ok") {
      return failure(response.error?.message ?? "Сервер не принял создание API-ключа.");
    }

    const data = response.data ?? {};
    const keyId = stringValue(data.key?.id);
    if (!keyId || data.rawKeyShownOnce !== true || stringValue(data.rawKey) === "" || stringValue(data.auditId) === "") {
      return failure("Создание API-ключа не подтверждено бэкендом.");
    }

    return {
      auditId: data.auditId,
      key: data.key,
      keyId,
      message: `${data.key.name}: ключ создан. Аудит ${data.auditId}.`,
      ok: true,
      rawKey: data.rawKey
    };
  } catch (error) {
    return failure(errorMessage(error, "Не удалось выполнить запрос создания API-ключа."));
  }
}

export async function submitApiKeyRevoke(keyId, service = integrationService) {
  const normalizedKeyId = stringValue(keyId);
  if (!normalizedKeyId) {
    return failure("Не указан идентификатор API-ключа.");
  }

  try {
    const response = await service.revokeApiKey(normalizedKeyId);
    if (response.status !== "ok") {
      return failure(response.error?.message ?? "Сервер не принял отзыв API-ключа.");
    }

    const data = response.data ?? {};
    if (stringValue(data.keyId) !== normalizedKeyId || data.status !== "revoked" || stringValue(data.auditId) === "") {
      return failure("Отзыв API-ключа не подтверждён бэкендом.");
    }

    return {
      auditId: data.auditId,
      keyId: normalizedKeyId,
      message: `${normalizedKeyId}: ключ отозван и больше не принимает запросы. Аудит ${data.auditId}.`,
      ok: true
    };
  } catch (error) {
    return failure(errorMessage(error, "Не удалось выполнить запрос отзыва API-ключа."));
  }
}

export async function submitWebhookEndpointCreate(form, service = integrationService) {
  const name = stringValue(form?.name);
  if (!name) {
    return failure("Укажите название endpoint'а.");
  }

  const url = stringValue(form?.url);
  if (!url) {
    return failure("Укажите URL endpoint'а.");
  }

  try {
    const response = await service.createWebhookEndpoint({
      channel: stringValue(form?.channel) || "SDK",
      name,
      url
    });
    if (response.status !== "ok") {
      return failure(response.error?.message ?? "Сервер не принял создание webhook endpoint.");
    }

    const endpoint = response.data?.endpoint;
    if (!stringValue(endpoint?.id)) {
      return failure("Создание webhook endpoint не подтверждено бэкендом.");
    }

    return {
      endpoint,
      message: `${endpoint.name}: endpoint создан, подпись ${endpoint.signature}.`,
      ok: true
    };
  } catch (error) {
    return failure(errorMessage(error, "Не удалось выполнить запрос создания webhook endpoint."));
  }
}

export async function submitWebhookEndpointUpdate(endpointId, patch, service = integrationService) {
  const normalizedEndpointId = stringValue(endpointId);
  if (!normalizedEndpointId) {
    return failure("Не указан идентификатор webhook endpoint.");
  }

  try {
    const response = await service.updateWebhookEndpoint({ endpointId: normalizedEndpointId, ...patch });
    if (response.status !== "ok") {
      return failure(response.error?.message ?? "Сервер не принял изменение webhook endpoint.");
    }

    const endpoint = response.data?.endpoint;
    if (stringValue(endpoint?.id) !== normalizedEndpointId) {
      return failure("Изменение webhook endpoint не подтверждено бэкендом.");
    }

    return {
      endpoint,
      message: `${endpoint.name}: изменения endpoint'а сохранены.`,
      ok: true
    };
  } catch (error) {
    return failure(errorMessage(error, "Не удалось выполнить запрос изменения webhook endpoint."));
  }
}

export async function submitWebhookEndpointDelete(endpoint, service = integrationService) {
  const endpointId = stringValue(endpoint?.id ?? endpoint);
  if (!endpointId) {
    return failure("Не указан идентификатор webhook endpoint.");
  }

  try {
    const response = await service.deleteWebhookEndpoint(endpointId);
    if (response.status !== "ok") {
      return failure(response.error?.message ?? "Сервер не принял удаление webhook endpoint.");
    }

    const data = response.data ?? {};
    if (data.deleted !== true || stringValue(data.endpointId) !== endpointId) {
      return failure("Удаление webhook endpoint не подтверждено бэкендом.");
    }

    return {
      endpointId,
      message: `${stringValue(endpoint?.name) || endpointId}: endpoint удалён.`,
      ok: true
    };
  } catch (error) {
    return failure(errorMessage(error, "Не удалось выполнить запрос удаления webhook endpoint."));
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

function parseScopes(value) {
  if (Array.isArray(value)) {
    return value.map((scope) => stringValue(scope)).filter(Boolean);
  }

  return stringValue(value)
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);
}

function errorMessage(error, fallback) {
  return error instanceof Error ? error.message : fallback;
}
