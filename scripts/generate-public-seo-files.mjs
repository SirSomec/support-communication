import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createPublicRouteManifest, getPublicSiteConfig } from "../src/public/seo/publicRouteManifest.js";

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function createRobotsTxt(env = {}) {
  const config = getPublicSiteConfig(env);
  if (!config.indexable) {
    return "User-agent: *\nDisallow: /\n";
  }
  const host = new URL(config.origin).host;
  return [
    "User-agent: *",
    "Allow: /",
    "Disallow: /api/",
    "Disallow: /s3/",
    "Disallow: /service-admin/",
    "",
    `Sitemap: ${config.origin}/sitemap.xml`,
    `Host: ${host}`,
    ""
  ].join("\n");
}

export function createSitemapXml(env = {}) {
  const config = getPublicSiteConfig(env);
  const routes = createPublicRouteManifest(env)
    .filter((route) => config.indexable && route.includeInSitemap);
  const entries = routes.map((route) => `  <url><loc>${escapeXml(route.canonical)}</loc></url>`).join("\n");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    entries,
    "</urlset>",
    ""
  ].join("\n");
}

export async function generatePublicSeoFiles({ distDir = resolve("dist"), env = process.env } = {}) {
  await mkdir(distDir, { recursive: true });
  await Promise.all([
    writeFile(resolve(distDir, "robots.txt"), createRobotsTxt(env), "utf8"),
    writeFile(resolve(distDir, "sitemap.xml"), createSitemapXml(env), "utf8")
  ]);
}

const directInvocation = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (directInvocation) {
  await generatePublicSeoFiles();
}
