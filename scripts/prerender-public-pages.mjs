import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createPublicRouteManifest, getPublicSiteConfig } from "../src/public/seo/publicRouteManifest.js";
import { createPublicStructuredData } from "../src/public/seo/publicStructuredData.js";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeJsonForHtml(value) {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

export function renderPublicSeoHead(route, routes, env = {}) {
  const config = getPublicSiteConfig(env);
  const verification = [
    config.googleSiteVerification
      ? `<meta name="google-site-verification" content="${escapeHtml(config.googleSiteVerification)}" />`
      : "",
    config.yandexSiteVerification
      ? `<meta name="yandex-verification" content="${escapeHtml(config.yandexSiteVerification)}" />`
      : ""
  ].filter(Boolean);
  const jsonLd = createPublicStructuredData(route, routes);
  return [
    `<title>${escapeHtml(route.title)}</title>`,
    `<meta name="description" content="${escapeHtml(route.description)}" />`,
    `<meta name="robots" content="${escapeHtml(route.robots)}" />`,
    `<link rel="canonical" href="${escapeHtml(route.canonical)}" />`,
    `<meta property="og:locale" content="ru_RU" />`,
    `<meta property="og:site_name" content="Support Communication" />`,
    `<meta property="og:type" content="${escapeHtml(route.openGraph.type)}" />`,
    `<meta property="og:title" content="${escapeHtml(route.openGraph.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(route.openGraph.description)}" />`,
    `<meta property="og:url" content="${escapeHtml(route.canonical)}" />`,
    `<meta property="og:image" content="${escapeHtml(route.openGraph.image)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(route.openGraph.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(route.openGraph.description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(route.openGraph.image)}" />`,
    ...verification,
    `<script type="application/ld+json">${escapeJsonForHtml(jsonLd)}</script>`
  ].join("\n    ");
}

export function injectPublicSeoDocument(template, route, routes, rootMarkup, env = {}) {
  const h1Match = String(rootMarkup || "").match(/<h1(?:\s[^>]*)?>([\s\S]*?)<\/h1>/i);
  const h1Text = h1Match?.[1]
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!h1Text) {
    throw new Error(`Prerendered route ${route.pathname} must contain a non-empty H1`);
  }
  const head = renderPublicSeoHead(route, routes, env);
  const headBlock = `<!-- PUBLIC_SEO_HEAD_START -->\n    ${head}\n    <!-- PUBLIC_SEO_HEAD_END -->`;
  const withoutGeneratedHead = template.replace(/\s*<!-- PUBLIC_SEO_HEAD_START -->[\s\S]*?<!-- PUBLIC_SEO_HEAD_END -->/i, "");
  const withoutTemplateTitle = withoutGeneratedHead.replace(/\s*<title[^>]*>[\s\S]*?<\/title>/i, "");
  const withHead = withoutTemplateTitle.includes("<!-- PUBLIC_SEO_HEAD -->")
    ? withoutTemplateTitle.replace("<!-- PUBLIC_SEO_HEAD -->", headBlock)
    : withoutTemplateTitle.replace("</head>", `    ${headBlock}\n  </head>`);
  const prerenderBlock = `<!-- PUBLIC_PRERENDER_START -->${rootMarkup}<!-- PUBLIC_PRERENDER_END -->`;
  let withMarkup;
  if (withHead.includes("<!-- PUBLIC_PRERENDER_START -->")) {
    withMarkup = withHead.replace(/<!-- PUBLIC_PRERENDER_START -->[\s\S]*?<!-- PUBLIC_PRERENDER_END -->/i, prerenderBlock);
  } else if (/<div id="root">\s*<\/div>/i.test(withHead)) {
    withMarkup = withHead.replace(/<div id="root">\s*<\/div>/i, `<div id="root">${prerenderBlock}</div>`);
  } else {
    throw new Error("Client template is missing an empty or previously prerendered #root");
  }
  return withMarkup;
}

export async function prerenderPublicPages({
  distDir = resolve(projectRoot, "dist"),
  ssrEntry = resolve(projectRoot, ".prerender/public-server-entry.js"),
  env = process.env,
  removeSsrArtifacts = true
} = {}) {
  const routes = createPublicRouteManifest(env);
  const templatePath = resolve(distDir, "index.html");
  const template = await readFile(templatePath, "utf8");
  try {
    const serverModule = await import(`${pathToFileURL(ssrEntry).href}?t=${Date.now()}`);
    if (typeof serverModule.render !== "function") throw new Error("SSR entry must export render(pathname)");
    for (const route of routes) {
      const rootMarkup = await serverModule.render(route.pathname);
      const document = injectPublicSeoDocument(template, route, routes, rootMarkup, env);
      const outputPath = resolve(distDir, route.outputFile);
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, document, "utf8");
    }
  } finally {
    if (removeSsrArtifacts) await rm(dirname(ssrEntry), { recursive: true, force: true });
  }
}

const directInvocation = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (directInvocation) {
  await prerenderPublicPages();
}
