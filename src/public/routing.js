import {
  getPublicRoute,
  normalizePublicPathname
} from "./seo/publicRouteManifest.js";

export { normalizePublicPathname } from "./seo/publicRouteManifest.js";

const legacyPublicPathByHash = Object.freeze({
  "#/landing": "/",
  "#/pricing": "/pricing/",
  "#/docs": "/docs/"
});

const privateWorkspaceHashes = ["#/app", "#/login", "#/auth", "#/invite", "#/onboarding"];

export function resolvePublicRoute(pathname = "/") {
  return getPublicRoute(normalizePublicPathname(pathname));
}

export function legacyPublicPathForHash(hash = "") {
  return legacyPublicPathByHash[String(hash)] ?? null;
}

export function normalizeLegacyPublicHash(locationLike = globalThis.location, historyLike = globalThis.history) {
  const pathname = legacyPublicPathForHash(locationLike?.hash);
  if (!pathname) return null;

  historyLike?.replaceState?.(null, "", `${pathname}${locationLike?.search ?? ""}`);
  return pathname;
}

export function isPrivateWorkspaceHash(hash = "") {
  const value = String(hash);
  return privateWorkspaceHashes.some((prefix) => value === prefix || value.startsWith(`${prefix}/`));
}

export function navigateToPrivateHash(hash, windowLike = globalThis.window) {
  if (!windowLike || !isPrivateWorkspaceHash(hash)) return false;

  windowLike.history.pushState(null, "", `/${hash}`);
  windowLike.location.reload();
  return true;
}

export function syncPublicDocumentHead(route, documentLike = globalThis.document) {
  if (!route || !documentLike?.head) return;

  documentLike.title = route.title;
  setHeadContent(documentLike, 'meta[name="description"]', "meta", { name: "description" }, route.description);
  setHeadContent(documentLike, 'meta[name="robots"]', "meta", { name: "robots" }, route.robots);
  setHeadContent(documentLike, 'meta[property="og:title"]', "meta", { property: "og:title" }, route.openGraph?.title);
  setHeadContent(documentLike, 'meta[property="og:description"]', "meta", { property: "og:description" }, route.openGraph?.description);
  setHeadContent(documentLike, 'meta[property="og:url"]', "meta", { property: "og:url" }, route.canonical);
  setHeadContent(documentLike, 'meta[property="og:type"]', "meta", { property: "og:type" }, route.openGraph?.type);
  setHeadContent(documentLike, 'meta[property="og:image"]', "meta", { property: "og:image" }, route.openGraph?.image);
  setHeadContent(documentLike, 'meta[name="twitter:title"]', "meta", { name: "twitter:title" }, route.openGraph?.title);
  setHeadContent(documentLike, 'meta[name="twitter:description"]', "meta", { name: "twitter:description" }, route.openGraph?.description);
  setHeadContent(documentLike, 'meta[name="twitter:image"]', "meta", { name: "twitter:image" }, route.openGraph?.image);

  let canonical = documentLike.head.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = documentLike.createElement("link");
    canonical.setAttribute("rel", "canonical");
    documentLike.head.append(canonical);
  }
  canonical.setAttribute("href", route.canonical);
}

function setHeadContent(documentLike, selector, tagName, attributes, content) {
  if (!content) return;
  let element = documentLike.head.querySelector(selector);
  if (!element) {
    element = documentLike.createElement(tagName);
    Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
    documentLike.head.append(element);
  }
  element.setAttribute("content", content);
}
