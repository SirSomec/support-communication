import { commercialPageDefinitions } from "../content/commercialPageDefinitions.js";

const DEFAULT_PUBLIC_SITE_ORIGIN = "https://supportcom.ru";
const DEFAULT_OG_IMAGE_PATH = "/og/support-communication.jpg";
const DEFAULT_BRAND_LOGO_PATH = "/icon-512.png";
const embeddedPublicSiteEnv = typeof __PUBLIC_SITE_BUILD_CONFIG__ === "undefined"
  ? Object.freeze({})
  : Object.freeze(__PUBLIC_SITE_BUILD_CONFIG__);
const defaultPublicSiteIndexable = !(typeof import.meta.env === "object" && import.meta.env?.DEV === true);

const coreRouteDefinitions = [
  Object.freeze({
    id: "home",
    view: "landing",
    pathname: "/",
    outputFile: "index.html",
    title: "Омниканальная поддержка клиентов в одном окне | Support Communication",
    description: "Объедините обращения из MAX, Telegram, ВКонтакте и Web SDK в одном окне: маршрутизация, SLA, контроль качества, отчёты и AI-бот.",
    h1: "Вся поддержка клиентов — в одном операционном контуре",
    breadcrumbLabel: "Главная",
    analyticsGoal: null,
    includeInSitemap: true,
    openGraph: Object.freeze({
      type: "website",
      imagePath: DEFAULT_OG_IMAGE_PATH
    }),
    jsonLdTypes: Object.freeze(["Organization", "WebSite", "SoftwareApplication"])
  }),
  Object.freeze({
    id: "pricing",
    view: "pricing",
    pathname: "/pricing/",
    outputFile: "pricing/index.html",
    title: "Тарифы платформы поддержки клиентов | Support Communication",
    description: "Сравните тарифы Support Communication для единого окна поддержки, маршрутизации обращений, контроля SLA, аналитики и автоматизации.",
    h1: "Начните бесплатно — выберите подходящий вариант, когда команда станет больше.",
    breadcrumbLabel: "Тарифы",
    analyticsGoal: "pricing_view",
    includeInSitemap: true,
    openGraph: Object.freeze({
      type: "website",
      imagePath: DEFAULT_OG_IMAGE_PATH
    }),
    jsonLdTypes: Object.freeze(["BreadcrumbList"])
  }),
  Object.freeze({
    id: "docs",
    view: "docs",
    pathname: "/docs/",
    outputFile: "docs/index.html",
    title: "API и интеграции платформы поддержки | Support Communication",
    description: "Документация Support Communication: Web SDK, публичный API, Open Channel, сообщения, файлы, CSAT, webhooks и безопасное подключение каналов.",
    h1: "Интеграции с Support Communication",
    breadcrumbLabel: "API и интеграции",
    analyticsGoal: "docs_view",
    includeInSitemap: true,
    openGraph: Object.freeze({
      type: "website",
      imagePath: DEFAULT_OG_IMAGE_PATH
    }),
    jsonLdTypes: Object.freeze(["BreadcrumbList"])
  })
];

const commercialRouteDefinitions = commercialPageDefinitions.map((page) => Object.freeze({
  id: page.id,
  view: "commercial",
  pathname: page.pathname,
  outputFile: page.outputFile,
  title: page.title,
  description: page.description,
  h1: page.h1,
  breadcrumbLabel: page.breadcrumbLabel,
  analyticsGoal: page.analyticsGoal,
  includeInSitemap: true,
  openGraph: Object.freeze({
    type: "website",
    imagePath: DEFAULT_OG_IMAGE_PATH
  }),
  jsonLdTypes: Object.freeze(["BreadcrumbList"])
}));

const routeDefinitions = Object.freeze([...coreRouteDefinitions, ...commercialRouteDefinitions]);

function readBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  throw new Error(`PUBLIC_SITE_INDEXABLE must be true or false, received: ${value}`);
}

function normalizeOrigin(value = DEFAULT_PUBLIC_SITE_ORIGIN) {
  const url = new URL(value || DEFAULT_PUBLIC_SITE_ORIGIN);
  if (!(["http:", "https:"].includes(url.protocol))) {
    throw new Error("PUBLIC_SITE_ORIGIN must use http or https");
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error("PUBLIC_SITE_ORIGIN must not contain a path, query, or fragment");
  }
  return url.origin;
}

function normalizeMetrikaId(value = "") {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "";
  if (!/^[1-9]\d{3,11}$/.test(normalized)) {
    throw new Error("PUBLIC_SITE_METRIKA_ID must contain 4 to 12 digits and cannot start with zero");
  }
  return normalized;
}

function absoluteUrl(origin, pathname) {
  return new URL(pathname.replace(/^\//, ""), `${origin}/`).href;
}

export function getPublicSiteConfig(env = embeddedPublicSiteEnv) {
  const origin = normalizeOrigin(env.PUBLIC_SITE_ORIGIN);
  return Object.freeze({
    origin,
    indexable: readBoolean(env.PUBLIC_SITE_INDEXABLE, defaultPublicSiteIndexable),
    metrikaId: normalizeMetrikaId(env.PUBLIC_SITE_METRIKA_ID),
    googleSiteVerification: env.PUBLIC_SITE_GOOGLE_VERIFICATION || env.GOOGLE_SITE_VERIFICATION || "",
    yandexSiteVerification: env.PUBLIC_SITE_YANDEX_VERIFICATION || env.YANDEX_SITE_VERIFICATION || ""
  });
}

export function createPublicRouteManifest(env = embeddedPublicSiteEnv) {
  const config = getPublicSiteConfig(env);
  return routeDefinitions.map((route) => Object.freeze({
    ...route,
    canonical: absoluteUrl(config.origin, route.pathname),
    brandLogo: absoluteUrl(config.origin, DEFAULT_BRAND_LOGO_PATH),
    robots: config.indexable ? "index,follow" : "noindex,nofollow",
    openGraph: Object.freeze({
      ...route.openGraph,
      title: route.title,
      description: route.description,
      image: absoluteUrl(config.origin, route.openGraph.imagePath)
    })
  }));
}

export function normalizePublicPathname(pathname = "/") {
  const value = String(pathname || "/").split(/[?#]/, 1)[0] || "/";
  if (value === "/") return value;
  return value.endsWith("/") ? value : `${value}/`;
}

export function getPublicRoute(pathname, env = embeddedPublicSiteEnv) {
  const normalizedPathname = normalizePublicPathname(pathname);
  return createPublicRouteManifest(env).find((route) => route.pathname === normalizedPathname) ?? null;
}

export const publicRouteManifest = createPublicRouteManifest();
export { DEFAULT_PUBLIC_SITE_ORIGIN };
