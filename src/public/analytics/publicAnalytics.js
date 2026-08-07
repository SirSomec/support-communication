import { commercialPageDefinitions } from "../content/commercialPageDefinitions.js";
import { getPublicSiteConfig } from "../seo/publicRouteManifest.js";

const METRIKA_SCRIPT_ID = "supportcom-yandex-metrika";
const METRIKA_SCRIPT_SRC = "https://mc.yandex.ru/metrika/tag.js";

export const PUBLIC_ANALYTICS_CONSENT_KEY = "supportcom:public-analytics-consent:v1";
export const PUBLIC_ANALYTICS_GOALS = Object.freeze({
  aiSupportBotView: commercialPageDefinitions.find((page) => page.id === "ai-support-bot").analyticsGoal,
  demoFormOpen: "demo_form_open",
  demoFormSubmitSuccess: "demo_form_submit_success",
  docsView: "docs_view",
  loginClick: "login_click",
  pricingView: "pricing_view",
  registrationStart: "registration_start",
  supportSlaView: commercialPageDefinitions.find((page) => page.id === "support-sla").analyticsGoal,
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
  documentRef = globalThis.document,
  windowRef = globalThis.window
} = {}) {
  const resolvedCounterId = resolveCounterId(counterId);
  if (!resolvedCounterId || !documentRef || !windowRef) return false;

  windowRef[counterDisableKey(resolvedCounterId)] = false;

  if (runtime.initialized && runtime.windowRef === windowRef && runtime.counterId === resolvedCounterId) {
    return true;
  }
  if (runtime.initialized) return false;

  if (typeof windowRef.ym !== "function") {
    const queuedYandexMetrika = function queuedYandexMetrika(...args) {
      queuedYandexMetrika.a.push(args);
    };
    queuedYandexMetrika.a = [];
    queuedYandexMetrika.l = Date.now();
    windowRef.ym = queuedYandexMetrika;
  }

  if (!documentRef.getElementById(METRIKA_SCRIPT_ID)) {
    const script = documentRef.createElement("script");
    script.id = METRIKA_SCRIPT_ID;
    script.async = true;
    script.src = METRIKA_SCRIPT_SRC;
    script.referrerPolicy = "strict-origin-when-cross-origin";
    documentRef.head.append(script);
  }

  runtime = {
    counterId: resolvedCounterId,
    initialized: true,
    routeGoalsSent: new Set(),
    windowRef
  };

  windowRef.ym(Number(resolvedCounterId), "init", {
    accurateTrackBounce: true,
    clickmap: false,
    sendTitle: false,
    trackHash: false,
    trackLinks: true,
    webvisor: false
  });
  return true;
}

export function disablePublicAnalytics({ counterId, windowRef = globalThis.window } = {}) {
  const resolvedCounterId = resolveCounterId(counterId);
  if (!resolvedCounterId || !windowRef) return false;
  windowRef[counterDisableKey(resolvedCounterId)] = true;
  return true;
}

export function trackPublicAnalyticsGoal(goal) {
  if (!runtime.initialized || !runtime.windowRef || !allowedGoals.has(goal)) return false;
  runtime.windowRef.ym(Number(runtime.counterId), "reachGoal", goal);
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
