import { commercialPageDefinitions } from "../content/commercialPageDefinitions.js";
import { getPublicSiteConfig } from "../seo/publicRouteManifest.js";

const METRIKA_SCRIPT_ID = "supportcom-yandex-metrika";
const METRIKA_SCRIPT_SRC = "https://mc.yandex.ru/metrika/tag.js";
const GA4_SCRIPT_ID = "supportcom-google-analytics";
const GA4_SCRIPT_SRC = "https://www.googletagmanager.com/gtag/js?id=";

export const PUBLIC_ANALYTICS_CONSENT_KEY = "supportcom:public-analytics-consent:v1";
export const PUBLIC_ANALYTICS_GOALS = Object.freeze({
  aiSupportBotView: commercialPageDefinitions.find((page) => page.id === "ai-support-bot").analyticsGoal,
  demoFormOpen: "demo_form_open",
  demoFormSubmitSuccess: "demo_form_submit_success",
  docsView: "docs_view",
  firstChannelConnected: "first_channel_connected",
  helpdeskSmallBusinessView: commercialPageDefinitions.find((page) => page.id === "helpdesk-small-business").analyticsGoal,
  helpdeskMigrationView: commercialPageDefinitions.find((page) => page.id === "helpdesk-migration").analyticsGoal,
  loginClick: "login_click",
  onboardingComplete: "onboarding_complete",
  onboardingStart: "onboarding_start",
  pricingView: "pricing_view",
  registrationStart: "registration_start",
  supportSlaView: commercialPageDefinitions.find((page) => page.id === "support-sla").analyticsGoal,
  omnichannelSupportView: commercialPageDefinitions.find((page) => page.id === "omnichannel-support").analyticsGoal,
  customerSupportPlatformView: commercialPageDefinitions.find((page) => page.id === "customer-support-platform").analyticsGoal,
  websiteSupportChatView: commercialPageDefinitions.find((page) => page.id === "website-support-chat").analyticsGoal
});

const allowedGoals = new Set(Object.values(PUBLIC_ANALYTICS_GOALS));
const routeViewGoals = new Set([
  PUBLIC_ANALYTICS_GOALS.docsView,
  PUBLIC_ANALYTICS_GOALS.pricingView,
  ...commercialPageDefinitions.map((page) => page.analyticsGoal)
]);

let runtime = createRuntime();

function createRuntime() {
  return {
    counterId: "",
    ga4MeasurementId: "",
    initialized: false,
    routeGoalsSent: new Set(),
    windowRef: null
  };
}

function counterDisableKey(counterId) {
  return `disableYaCounter${counterId}`;
}

function resolveCounterId(counterId) {
  return String(counterId ?? getPublicSiteConfig().metrikaId ?? "");
}

function resolveGa4MeasurementId(measurementId) {
  return String(measurementId ?? getPublicSiteConfig().ga4MeasurementId ?? "");
}

export function readPublicAnalyticsConsent(storage = globalThis.localStorage) {
  try {
    const value = storage?.getItem(PUBLIC_ANALYTICS_CONSENT_KEY);
    return value === "granted" || value === "denied" ? value : null;
  } catch {
    return null;
  }
}

export function writePublicAnalyticsConsent(value, storage = globalThis.localStorage) {
  if (value !== "granted" && value !== "denied") {
    throw new Error("Public analytics consent must be granted or denied");
  }
  try {
    storage?.setItem(PUBLIC_ANALYTICS_CONSENT_KEY, value);
  } catch {
    // Analytics remains fail-closed when storage is unavailable.
  }
}

export function initializePublicAnalytics({
  counterId,
  ga4MeasurementId,
  documentRef = globalThis.document,
  windowRef = globalThis.window
} = {}) {
  const resolvedCounterId = resolveCounterId(counterId);
  const resolvedGa4MeasurementId = resolveGa4MeasurementId(ga4MeasurementId);
  if ((!resolvedCounterId && !resolvedGa4MeasurementId) || !documentRef || !windowRef) return false;

  if (resolvedCounterId) windowRef[counterDisableKey(resolvedCounterId)] = false;

  if (runtime.initialized && runtime.windowRef === windowRef && runtime.counterId === resolvedCounterId && runtime.ga4MeasurementId === resolvedGa4MeasurementId) {
    return true;
  }
  if (runtime.initialized) return false;

  if (resolvedCounterId && typeof windowRef.ym !== "function") {
    const queuedYandexMetrika = function queuedYandexMetrika(...args) {
      queuedYandexMetrika.a.push(args);
    };
    queuedYandexMetrika.a = [];
    queuedYandexMetrika.l = Date.now();
    windowRef.ym = queuedYandexMetrika;
  }

  if (resolvedCounterId && !documentRef.getElementById(METRIKA_SCRIPT_ID)) {
    const script = documentRef.createElement("script");
    script.id = METRIKA_SCRIPT_ID;
    script.async = true;
    script.src = METRIKA_SCRIPT_SRC;
    script.referrerPolicy = "strict-origin-when-cross-origin";
    documentRef.head.append(script);
  }

  if (resolvedGa4MeasurementId && typeof windowRef.gtag !== "function") {
    windowRef.dataLayer = windowRef.dataLayer || [];
    windowRef.gtag = function gtag(...args) {
      windowRef.dataLayer.push(args);
    };
  }

  if (resolvedGa4MeasurementId && !documentRef.getElementById(GA4_SCRIPT_ID)) {
    const script = documentRef.createElement("script");
    script.id = GA4_SCRIPT_ID;
    script.async = true;
    script.src = `${GA4_SCRIPT_SRC}${encodeURIComponent(resolvedGa4MeasurementId)}`;
    script.referrerPolicy = "strict-origin-when-cross-origin";
    documentRef.head.append(script);
  }

  runtime = {
    counterId: resolvedCounterId,
    ga4MeasurementId: resolvedGa4MeasurementId,
    initialized: true,
    routeGoalsSent: new Set(),
    windowRef
  };

  if (resolvedCounterId) {
    windowRef.ym(Number(resolvedCounterId), "init", {
      accurateTrackBounce: true,
      clickmap: false,
      sendTitle: false,
      trackHash: false,
      trackLinks: true,
      webvisor: false
    });
  }
  if (resolvedGa4MeasurementId) {
    windowRef.gtag("js", new Date());
    windowRef.gtag("config", resolvedGa4MeasurementId, { send_page_view: true });
  }
  return true;
}

export function disablePublicAnalytics({ counterId, windowRef = globalThis.window } = {}) {
  const resolvedCounterId = resolveCounterId(counterId);
  if (!resolvedCounterId || !windowRef) return false;
  windowRef[counterDisableKey(resolvedCounterId)] = true;
  return true;
}

export function initializePublicAnalyticsFromConsent({
  documentRef = globalThis.document,
  storage = globalThis.localStorage,
  windowRef = globalThis.window
} = {}) {
  if (readPublicAnalyticsConsent(storage) !== "granted") return false;
  const config = getPublicSiteConfig();
  return initializePublicAnalytics({
    counterId: config.metrikaId,
    ga4MeasurementId: config.ga4MeasurementId,
    documentRef,
    windowRef
  });
}

export function trackPublicAnalyticsGoal(goal) {
  if (!runtime.initialized || !runtime.windowRef || !allowedGoals.has(goal)) return false;
  if (runtime.counterId) runtime.windowRef.ym(Number(runtime.counterId), "reachGoal", goal);
  if (runtime.ga4MeasurementId) runtime.windowRef.gtag("event", goal);
  return true;
}

export function trackPublicRouteView(goal) {
  if (!routeViewGoals.has(goal) || runtime.routeGoalsSent.has(goal)) return false;
  if (!trackPublicAnalyticsGoal(goal)) return false;
  runtime.routeGoalsSent.add(goal);
  return true;
}

export function resetPublicAnalyticsForTests() {
  runtime = createRuntime();
}
