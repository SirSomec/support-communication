const TENANT_ACCESS_TOKEN_KEY = "sc_access_token";
const TENANT_ID_KEY = "sc_tenant_id";
const TENANT_OPERATOR_KEY = "sc_operator";
const SERVICE_ADMIN_ACCESS_TOKEN_KEY = "sc_service_admin_access_token";

const MANAGED_KEYS = [
  TENANT_ACCESS_TOKEN_KEY,
  TENANT_ID_KEY,
  TENANT_OPERATOR_KEY,
  SERVICE_ADMIN_ACCESS_TOKEN_KEY
];

const memoryStorage = new Map();

const memoryAdapter = {
  getItem(key) {
    return memoryStorage.has(key) ? memoryStorage.get(key) : null;
  },
  setItem(key, value) {
    memoryStorage.set(key, String(value));
  },
  removeItem(key) {
    memoryStorage.delete(key);
  }
};

let resolvedStorage = null;

// Сессия должна переживать перезапуск браузера и открываться из любой вкладки,
// поэтому основное хранилище — localStorage; срок жизни (12 часов после последней
// активности) контролирует бэкенд, а не время жизни вкладки.
function getStorage() {
  if (!resolvedStorage) {
    const local = probeWebStorage("localStorage");
    const session = probeWebStorage("sessionStorage");
    if (local) {
      migrateLegacySessionKeys(session, local);
    }
    resolvedStorage = local ?? session ?? memoryAdapter;
  }

  return resolvedStorage;
}

function probeWebStorage(name) {
  try {
    const storage = globalThis[name];
    if (!storage) {
      return null;
    }

    const probeKey = "sc_storage_probe";
    storage.setItem(probeKey, "1");
    storage.removeItem(probeKey);
    return storage;
  } catch {
    return null;
  }
}

// До перехода на localStorage токены жили в sessionStorage: переносим их, чтобы
// активные сессии не разлогинивались. Значение из sessionStorage свежее — оно побеждает.
function migrateLegacySessionKeys(from, to) {
  if (!from || from === to) {
    return;
  }

  for (const key of MANAGED_KEYS) {
    try {
      const value = from.getItem(key);
      if (value !== null) {
        to.setItem(key, value);
        from.removeItem(key);
      }
    } catch {
      // Недоступное хранилище не должно ломать чтение сессии.
    }
  }
}

export function getTenantAccessToken() {
  const value = getStorage().getItem(TENANT_ACCESS_TOKEN_KEY);
  return value || null;
}

export function getServiceAdminAccessToken() {
  const value = getStorage().getItem(SERVICE_ADMIN_ACCESS_TOKEN_KEY);
  return value || null;
}

export function getAccessToken() {
  return getTenantAccessToken();
}

export function getTenantId() {
  const value = getStorage().getItem(TENANT_ID_KEY);
  return value || null;
}

export function getOperator() {
  const raw = getStorage().getItem(TENANT_OPERATOR_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setTenantSession({ accessToken, tenantId, operator } = {}) {
  const storage = getStorage();

  if (accessToken) {
    storage.setItem(TENANT_ACCESS_TOKEN_KEY, accessToken);
  }

  if (tenantId) {
    storage.setItem(TENANT_ID_KEY, tenantId);
  }

  if (operator !== undefined && operator !== null) {
    storage.setItem(TENANT_OPERATOR_KEY, JSON.stringify(operator));
  }
}

export function setServiceAdminSession({ accessToken } = {}) {
  const storage = getStorage();

  if (accessToken) {
    storage.setItem(SERVICE_ADMIN_ACCESS_TOKEN_KEY, accessToken);
  }
}

export function setSession(session = {}) {
  setTenantSession(session);
}

export function clearTenantSession() {
  const storage = getStorage();
  storage.removeItem(TENANT_ACCESS_TOKEN_KEY);
  storage.removeItem(TENANT_ID_KEY);
  storage.removeItem(TENANT_OPERATOR_KEY);
}

export function clearServiceAdminSession() {
  getStorage().removeItem(SERVICE_ADMIN_ACCESS_TOKEN_KEY);
}

export function clearSession() {
  clearTenantSession();
}

export function hasSession() {
  return Boolean(getTenantAccessToken());
}

export function hasServiceAdminSession() {
  return Boolean(getServiceAdminAccessToken());
}
