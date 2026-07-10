const TENANT_ACCESS_TOKEN_KEY = "sc_access_token";
const TENANT_ID_KEY = "sc_tenant_id";
const TENANT_OPERATOR_KEY = "sc_operator";
const SERVICE_ADMIN_ACCESS_TOKEN_KEY = "sc_service_admin_access_token";

const memoryStorage = new Map();

function getStorage() {
  if (typeof sessionStorage !== "undefined") {
    return sessionStorage;
  }

  return {
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
