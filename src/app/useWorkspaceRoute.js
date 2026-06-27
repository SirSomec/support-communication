import { useCallback, useEffect, useMemo, useState } from "react";

const routeByHash = {
  "#/landing": { namespace: "public", view: "landing" },
  "#/login": { namespace: "auth", view: "login" },
  "#/auth": { namespace: "auth", view: "login" },
  "#/onboarding": { namespace: "onboarding", view: "organization" },
  "#/service-admin": { namespace: "service-admin", view: "dashboard" }
};

const defaultRoute = { namespace: "app", view: "dialogs" };

export function useWorkspaceRoute({ access, onDenied, onAuthenticated }) {
  const [route, setRoute] = useState(() => parseCurrentRoute());
  const isServiceAdminDenied = route.namespace === "service-admin" && !access.canServiceAdmin;

  useEffect(() => {
    function handleHashChange() {
      setRoute(parseCurrentRoute());
    }

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    if (isServiceAdminDenied) {
      onDenied?.("Администрирование сервиса доступно только внутреннему администратору сервиса.");
      setRoute(defaultRoute);
      if (window.location.hash === "#/service-admin") {
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
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
    openServiceAdmin: () => navigate("service-admin", "dashboard"),
    completeAuth: (payload) => {
      onAuthenticated?.(payload);
      navigate("app", "dialogs");
    },
    completeOnboarding: (payload) => {
      onAuthenticated?.(payload);
      navigate("app", "dialogs");
    }
  }), [navigate, onAuthenticated]);

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
    return "#/service-admin";
  }

  return "";
}
