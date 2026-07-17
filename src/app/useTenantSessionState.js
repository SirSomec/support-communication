import { useCallback, useEffect, useState } from "react";
import { authService } from "../services/authService.js";
import { clearTenantSession } from "./sessionStore.js";

const initialState = {
  authenticated: false,
  denialReason: null,
  hydrationMode: "initial",
  loading: true,
  operator: null,
  permissions: [],
  tenantId: null
};

export function useTenantSessionState({ enabled = true } = {}) {
  const [state, setState] = useState(initialState);

  const logout = useCallback(async () => {
    const response = await authService.logoutTenant();
    clearTenantSession();
    setState({
      ...initialState,
      denialReason: response.status === "ok" ? null : response.error?.message ?? "logout_failed",
      hydrationMode: "enabled",
      loading: false
    });
    return response;
  }, []);

  const refresh = useCallback(async ({ force = false } = {}) => {
    if (!enabled && !force) {
      setState({ ...initialState, hydrationMode: "disabled", loading: false });
      return;
    }

    setState((current) => ({ ...current, hydrationMode: "pending", loading: true, denialReason: null }));
    const response = await authService.getTenantOperatorState();

    if (response.status === "ok" && response.data?.authenticated) {
      setState({
        authenticated: true,
        denialReason: null,
        hydrationMode: "enabled",
        loading: false,
        operator: response.data.operator ?? null,
        permissions: Array.isArray(response.data.permissions) ? response.data.permissions : [],
        tenantId: response.data.tenantId ?? null
      });
      return response;
    }

    const denialCode = response.error?.code ?? "session_not_found";
    if (["session_not_found", "session_revoked", "session_expired", "unauthorized"].includes(denialCode)) {
      clearTenantSession();
    }

    setState({
      authenticated: false,
      denialReason: response.error?.message ?? denialCode,
      hydrationMode: "enabled",
      loading: false,
      operator: null,
      permissions: [],
      tenantId: null
    });
    return response;
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const hydration = resolveTenantSessionHydration(state, enabled);

  return {
    ...state,
    ...hydration,
    logout,
    refresh
  };
}

export function resolveTenantSessionHydration(state, enabled) {
  const hydrated = enabled ? state?.hydrationMode === "enabled" : state?.hydrationMode !== "initial";
  return {
    hydrated,
    loading: Boolean(state?.loading || (enabled && !hydrated))
  };
}
