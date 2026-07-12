import { useCallback, useEffect, useMemo, useState } from "react";
import { legacyServiceAdminHashToPath } from "../service-admin/serviceAdminPath.js";

const routeByHash = {
  "#/app": { namespace: "app", view: "dialogs" },
  "#/landing": { namespace: "public", view: "landing" },
  "#/login": { namespace: "auth", view: "login" },
  "#/auth": { namespace: "auth", view: "login" },
  "#/onboarding": { namespace: "onboarding", view: "organization" }
};

const defaultRoute = { namespace: "public", view: "landing" };

export function useWorkspaceRoute({
  onDenied,
  onAuthenticated,
  tenantSession
}) {
  const [route, setRoute] = useState(() => parseCurrentRoute());
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
  const legacyPath = legacyServiceAdminHashToPath(window.location.hash);
  if (legacyPath) {
    window.location.replace(legacyPath);
    return defaultRoute;
  }

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

  if (route.namespace === "app") {
    return "#/app";
  }

  return "";
}
