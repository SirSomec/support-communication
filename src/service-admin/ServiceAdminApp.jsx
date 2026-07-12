import React, { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { clearServiceAdminSession, hasServiceAdminSession } from "../app/sessionStore.js";
import { RouteLoading } from "../app/RouteLoading.jsx";
import { Toast } from "../ui.jsx";
import { parseServiceAdminPath, serviceAdminPathForView } from "./serviceAdminPath.js";
import "../styles.css";
import "../features/app-shell/app-shell.css";
import "./service-admin-app.css";

const ServiceAdminDashboard = lazy(() =>
  import("../features/service-admin/index.js").then((module) => ({
    default: module.ServiceAdminDashboard
  }))
);

const ServiceAdminLogin = lazy(() =>
  import("../features/service-admin/ServiceAdminLogin.jsx").then((module) => ({
    default: module.ServiceAdminLogin
  }))
);

export function ServiceAdminApp() {
  const [view, setView] = useState(() => resolveInitialView());
  const [toast, setToast] = useState("");

  useEffect(() => {
    function syncFromLocation() {
      setView(resolveInitialView());
    }

    window.addEventListener("popstate", syncFromLocation);
    return () => window.removeEventListener("popstate", syncFromLocation);
  }, []);

  const navigate = useCallback((nextView) => {
    const path = serviceAdminPathForView(nextView);
    if (`${window.location.pathname}${window.location.search}` !== path) {
      window.history.pushState(null, "", path);
    }
    setView(nextView);
  }, []);

  function handleLoginSuccess() {
    navigate("dashboard");
  }

  function handleLogoutOrBack() {
    clearServiceAdminSession();
    navigate("login");
  }

  if (view === "login") {
    return (
      <>
        <Suspense fallback={<RouteLoading label="Загрузка входа администратора сервиса" />}>
          <ServiceAdminLogin onSuccess={handleLoginSuccess} />
        </Suspense>
        {toast ? <Toast message={toast} onClose={() => setToast("")} /> : null}
      </>
    );
  }

  return (
    <div data-testid="route-service-admin" className="app-shell service-admin-app">
      <main className="workspace">
        <Suspense fallback={<RouteLoading label="Загрузка администрирования сервиса" />}>
          <ServiceAdminDashboard
            backLabel="Выйти"
            onBack={handleLogoutOrBack}
            onToast={setToast}
          />
        </Suspense>
      </main>
      {toast ? <Toast message={toast} onClose={() => setToast("")} /> : null}
    </div>
  );
}

function resolveInitialView() {
  const parsed = parseServiceAdminPath(window.location.pathname);
  const requested = parsed?.view === "login" ? "login" : "dashboard";

  if (requested === "dashboard" && !hasServiceAdminSession()) {
    const loginPath = serviceAdminPathForView("login");
    if (window.location.pathname !== loginPath) {
      window.history.replaceState(null, "", loginPath);
    }
    return "login";
  }

  return requested;
}
