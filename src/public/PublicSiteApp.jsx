import React, { useCallback, useEffect, useState } from "react";
import { ApiDocsPage } from "../features/public/ApiDocsPage.jsx";
import { CommercialLandingPage } from "../features/public/CommercialLandingPage.jsx";
import { LandingPage } from "../features/public/LandingPage.jsx";
import { PricingPage } from "../features/public/PricingPage.jsx";
import { publicLeadService } from "../services/publicLeadService.js";
import {
  disablePublicAnalytics,
  initializePublicAnalytics,
  PUBLIC_ANALYTICS_GOALS,
  readPublicAnalyticsConsent,
  trackPublicAnalyticsGoal,
  trackPublicRouteView,
  writePublicAnalyticsConsent
} from "./analytics/publicAnalytics.js";
import { resolvePublicRoute } from "./routing.js";
import { getPublicSiteConfig } from "./seo/publicRouteManifest.js";

const PUBLIC_TEST_IDS = Object.freeze({
  docs: "route-public-docs",
  commercial: "route-public-commercial",
  landing: "route-public-landing",
  pricing: "route-public-pricing"
});

function navigateToPrivateHash(hash) {
  if (typeof window !== "undefined") {
    window.location.assign(`/${hash}`);
  }
}

function PublicToast({ message, onClose }) {
  return (
    <div className="public-toast" role="status">
      <span>{message}</span>
      <button aria-label="Закрыть уведомление" onClick={onClose} type="button">×</button>
    </div>
  );
}

function PublicAnalyticsConsent({ route }) {
  const { metrikaId } = getPublicSiteConfig();
  const [consent, setConsent] = useState("loading");
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    if (!metrikaId) return;
    const storedConsent = readPublicAnalyticsConsent();
    setConsent(storedConsent ?? "unset");
    if (storedConsent === "granted") {
      initializePublicAnalytics({ counterId: metrikaId });
      trackPublicRouteView(route.analyticsGoal);
    } else if (storedConsent === "denied") {
      disablePublicAnalytics({ counterId: metrikaId });
    }
  }, [metrikaId, route.analyticsGoal]);

  if (!metrikaId || consent === "loading") return null;

  function grantConsent() {
    writePublicAnalyticsConsent("granted");
    setConsent("granted");
    setSettingsOpen(false);
    initializePublicAnalytics({ counterId: metrikaId });
    trackPublicRouteView(route.analyticsGoal);
  }

  function denyConsent() {
    writePublicAnalyticsConsent("denied");
    setConsent("denied");
    setSettingsOpen(false);
    disablePublicAnalytics({ counterId: metrikaId });
  }

  const showDialog = consent === "unset" || settingsOpen;
  if (!showDialog) {
    return (
      <button className="public-analytics-settings" onClick={() => setSettingsOpen(true)} type="button">
        Настройки аналитики
      </button>
    );
  }

  return (
    <aside aria-labelledby="public-analytics-title" className="public-analytics-consent" role="dialog">
      <div>
        <strong id="public-analytics-title">Помогите улучшать сайт</strong>
        <p>С вашего согласия Яндекс Метрика собирает обезличенную статистику посещений и конверсий. Вебвизор выключен, данные полей форм не передаются.</p>
      </div>
      <div className="public-analytics-actions">
        <button className="public-btn secondary" onClick={denyConsent} type="button">Отказаться</button>
        <button className="public-btn primary" onClick={grantConsent} type="button">Разрешить аналитику</button>
      </div>
    </aside>
  );
}

export function PublicSiteApp({ pathname = globalThis.location?.pathname ?? "/" }) {
  const route = resolvePublicRoute(pathname);
  const [toast, setToast] = useState("");

  const handlePublicDemoRequest = useCallback(async (payload) => {
    const response = await publicLeadService.createDemoRequest(payload);

    if (response.status === "ok") {
      trackPublicAnalyticsGoal(PUBLIC_ANALYTICS_GOALS.demoFormSubmitSuccess);
      setToast("Заявка на демо принята. Мы свяжемся с вами после проверки маршрута.");
      return response;
    }

    if (response.status === "rate_limited" && response.data?.duplicate) {
      setToast("Заявка уже принята. Повторная отправка ограничена.");
      return response;
    }

    setToast(response.error?.message ?? "Не удалось отправить заявку на демо.");
    return response;
  }, []);

  const handleNavigateAuth = useCallback(() => {
    trackPublicAnalyticsGoal(PUBLIC_ANALYTICS_GOALS.loginClick);
    navigateToPrivateHash("#/login");
  }, []);

  const handleStartFree = useCallback(() => {
    trackPublicAnalyticsGoal(PUBLIC_ANALYTICS_GOALS.registrationStart);
    navigateToPrivateHash("#/onboarding");
  }, []);

  if (!route) return null;

  let page;
  if (route.view === "docs") {
    page = <ApiDocsPage />;
  } else if (route.view === "commercial") {
    page = <CommercialLandingPage onStartFree={handleStartFree} pageId={route.id} />;
  } else if (route.view === "pricing") {
    page = (
      <PricingPage
        onNavigateAuth={handleNavigateAuth}
        onRequestDemo={handlePublicDemoRequest}
        onStartFree={handleStartFree}
      />
    );
  } else {
    page = (
      <LandingPage
        demoRequestEnabled
        onDemoOpen={() => trackPublicAnalyticsGoal(PUBLIC_ANALYTICS_GOALS.demoFormOpen)}
        onNavigateAuth={handleNavigateAuth}
        onRequestDemo={handlePublicDemoRequest}
        onStartFree={handleStartFree}
      />
    );
  }

  return (
    <div data-testid={PUBLIC_TEST_IDS[route.view]}>
      {page}
      <PublicAnalyticsConsent route={route} />
      {toast ? <PublicToast message={toast} onClose={() => setToast("")} /> : null}
    </div>
  );
}

export default PublicSiteApp;
