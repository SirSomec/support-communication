import React, { useCallback, useState } from "react";
import { ApiDocsPage } from "../features/public/ApiDocsPage.jsx";
import { LandingPage } from "../features/public/LandingPage.jsx";
import { PricingPage } from "../features/public/PricingPage.jsx";
import { publicLeadService } from "../services/publicLeadService.js";
import { resolvePublicRoute } from "./routing.js";

const PUBLIC_TEST_IDS = Object.freeze({
  docs: "route-public-docs",
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

export function PublicSiteApp({ pathname = globalThis.location?.pathname ?? "/" }) {
  const route = resolvePublicRoute(pathname);
  const [toast, setToast] = useState("");

  const handlePublicDemoRequest = useCallback(async (payload) => {
    const response = await publicLeadService.createDemoRequest(payload);

    if (response.status === "ok") {
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

  if (!route) return null;

  let page;
  if (route.view === "docs") {
    page = <ApiDocsPage />;
  } else if (route.view === "pricing") {
    page = (
      <PricingPage
        onNavigateAuth={() => navigateToPrivateHash("#/login")}
        onRequestDemo={handlePublicDemoRequest}
        onStartFree={() => navigateToPrivateHash("#/onboarding")}
      />
    );
  } else {
    page = (
      <LandingPage
        demoRequestEnabled
        onNavigateAuth={() => navigateToPrivateHash("#/login")}
        onRequestDemo={handlePublicDemoRequest}
        onStartFree={() => navigateToPrivateHash("#/onboarding")}
      />
    );
  }

  return (
    <div data-testid={PUBLIC_TEST_IDS[route.view]}>
      {page}
      {toast ? <PublicToast message={toast} onClose={() => setToast("")} /> : null}
    </div>
  );
}

export default PublicSiteApp;
