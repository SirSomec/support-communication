import { useCallback, useEffect, useMemo, useState } from "react";
import { hasServiceAdminSession } from "./sessionStore.js";

const routeByHash = {
  "#/app": { namespace: "app", view: "dialogs" },
  "#/landing": { namespace: "public", view: "landing" },
  "#/login": { namespace: "auth", view: "login" },
  "#/auth": { namespace: "auth", view: "login" },
  "#/onboarding": { namespace: "onboarding", view: "organization" },
  "#/service-admin": { namespace: "service-admin", view: "dashboard" },
  "#/service-admin/login": { namespace: "service-admin", view: "login" }
};

const defaultRoute = { namespace: "public", view: "landing" };

export function useWorkspaceRoute({
  access,
  onDenied,
  onAuthenticated,
  tenantSession
}) {
  const [route, setRoute] = useState(() => parseCurrentRoute());
  const isServiceAdminDenied = route.namespace === "service-admin"
    && route.view === "dashboard"
    && (!access.canServiceAdmin || !hasServiceAdminSession());
  const isAppDenied = route.namespace === "app" && !tenantSession.loading && !tenantSession.authenticated;

  useEffect(() => {
    function handleHashChange() {
      setRoute(parseCurrentRoute());
    }

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    if (tenantSession.loading) {
      return;
    }

    if (isAppDenied) {
      onDenied?.(tenantSession.denialReason ?? "Войдите в аккаунт оператора, чтобы открыть рабочее место.");
      setRoute({ namespace: "auth", view: "login" });

      if (window.location.hash === "#/app") {
        window.history.replaceState(null, "", "#/login");
      }
    }
  }, [isAppDenied, onDenied, tenantSession.denialReason, tenantSession.loading]);

  useEffect(() => {
    if (isServiceAdminDenied) {
      onDenied?.("Войдите под учетной записью администратора сервиса, чтобы открыть этот раздел.");
      setRoute({ namespace: "service-admin", view: "login" });
      if (window.location.hash === "#/service-admin") {
        window.history.replaceState(null, "", "#/service-admin/login");
      }
    }
  }, [isServiceAdminDenied, onDenied]);

  const navigate = useCallback((namespace, view = namespace) => {
    const nextRoute = { namespace, view };
    setRoute(nextRoute);
    const nextHash = hashForRoute(nextRoute);

    if (nextHash) {
      window.history.pushState(null, "", nextHash);
    } else if (window.location.hash) {
      window.history.pushState(null, "", window.location.pathname + window.location.search);
    }
  }, []);

  const actions = useMemo(() => ({
    openApp: () => navigate("app", "dialogs"),
    openAuth: () => navigate("auth", "login"),
    openLanding: () => navigate("public", "landing"),
    openOnboarding: () => navigate("onboarding", "organization"),
    openServiceAdmin: () => navigate("service-admin", hasServiceAdminSession() ? "dashboard" : "login"),
    completeAuth: async (payload) => {
      onAuthenticated?.(payload);
      await tenantSession.refresh?.({ force: true });
      navigate("app", "dialogs");
    },
    completeOnboarding: async (payload) => {
      onAuthenticated?.(payload);
      await tenantSession.refresh?.({ force: true });
      navigate("app", "dialogs");
    }
  }), [navigate, onAuthenticated, tenantSession]);

  return {
    route,
    routeActions: actions
  };
}

function parseCurrentRoute() {
  return routeByHash[window.location.hash] ?? defaultRoute;
}

function hashForRoute(route) {
  if (route.namespace === "public") {
    return "#/landing";
  }

  if (route.namespace === "auth") {
    return "#/login";
  }

  if (route.namespace === "onboarding") {
    return "#/onboarding";
  }

  if (route.namespace === "service-admin") {
    return route.view === "login" ? "#/service-admin/login" : "#/service-admin";
  }

  if (route.namespace === "app") {
    return "#/app";
  }

  return "";
}
