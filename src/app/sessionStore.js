const ACCESS_TOKEN_KEY = "sc_access_token";
const TENANT_ID_KEY = "sc_tenant_id";
const OPERATOR_KEY = "sc_operator";

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

export function getAccessToken() {
  const value = getStorage().getItem(ACCESS_TOKEN_KEY);
  return value || null;
}

export function getTenantId() {
  const value = getStorage().getItem(TENANT_ID_KEY);
  return value || null;
}

export function getOperator() {
  const raw = getStorage().getItem(OPERATOR_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setSession({ accessToken, tenantId, operator } = {}) {
  const storage = getStorage();

  if (accessToken) {
    storage.setItem(ACCESS_TOKEN_KEY, accessToken);
  }

  if (tenantId) {
    storage.setItem(TENANT_ID_KEY, tenantId);
  }

  if (operator !== undefined && operator !== null) {
    storage.setItem(OPERATOR_KEY, JSON.stringify(operator));
  }
}

export function clearSession() {
  const storage = getStorage();
  storage.removeItem(ACCESS_TOKEN_KEY);
  storage.removeItem(TENANT_ID_KEY);
  storage.removeItem(OPERATOR_KEY);
}

export function hasSession() {
  return Boolean(getAccessToken());
}
