import { useCallback, useEffect, useMemo, useState } from "react";
import { legacyServiceAdminHashToPath } from "../service-admin/serviceAdminPath.js";

const routeByHash = {
  "#/app": { namespace: "app", view: "dialogs" },
  "#/landing": { namespace: "public", view: "landing" },
  "#/docs": { namespace: "public", view: "docs" },
  "#/login": { namespace: "auth", view: "login" },
  "#/auth": { namespace: "auth", view: "login" },
  "#/onboarding": { namespace: "onboarding", view: "organization" }
};

const defaultRoute = { namespace: "public", view: "landing" };

const hashByPathPattern = [
  [/^\/(auth|login)(\/|$)/, "#/login"],
  [/^\/app(\/|$)/, "#/app"],
  [/^\/onboarding(\/|$)/, "#/onboarding"],
  [/^\/landing(\/|$)/, "#/landing"],
  [/^\/docs(\/|$)/, "#/docs"]
];

// Прямые URL вида /auth/login приводим к hash-роуту до первого рендера,
// иначе роутер (он читает только hash) покажет лендинг вместо нужного экрана.
export function normalizeDeepLinkPath() {
  if (routeByHash[window.location.hash]) {
    return;
  }

  const matched = hashByPathPattern.find(([pattern]) => pattern.test(window.location.pathname));
  if (matched) {
    window.history.replaceState(null, "", `/${matched[1]}`);
  }
}

export function useWorkspaceRoute({
  onDenied,
  onAuthenticated,
  tenantSession
}) {
  const [route, setRoute] = useState(() => parseCurrentRoute());
  const sessionHydrated = tenantSession.hydrated ?? !tenantSession.loading;
  const isAppDenied = route.namespace === "app"
    && sessionHydrated
    && !tenantSession.loading
    && !tenantSession.authenticated;
  const shouldRedirectAuthenticatedTenant = route.namespace === "auth"
    && sessionHydrated
    && !tenantSession.loading
    && tenantSession.authenticated;

  useEffect(() => {
    function handleHashChange() {
      setRoute(parseCurrentRoute());
    }

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    if (!sessionHydrated || tenantSession.loading) {
      return;
    }

    if (isAppDenied) {
      onDenied?.(tenantSession.denialReason ?? "Войдите в аккаунт оператора, чтобы открыть рабочее место.");
      setRoute({ namespace: "auth", view: "login" });

      if (window.location.hash === "#/app") {
        window.history.replaceState(null, "", "#/login");
      }
    }
  }, [isAppDenied, onDenied, sessionHydrated, tenantSession.denialReason, tenantSession.loading]);

  useEffect(() => {
    if (!shouldRedirectAuthenticatedTenant) {
      return;
    }

    setRoute({ namespace: "app", view: "dialogs" });
    window.history.replaceState(null, "", "#/app");
  }, [shouldRedirectAuthenticatedTenant]);

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
    return route.view === "docs" ? "#/docs" : "#/landing";
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
