import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createPublicRouteManifest, getPublicSiteConfig } from "../src/public/seo/publicRouteManifest.js";

function countMatches(value, expression) {
  return [...value.matchAll(expression)].length;
}

function extractJsonLd(html) {
  return [...html.matchAll(/<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1]);
}

function visibleTextLength(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&\w+;/g, " ")
    .replace(/\s+/g, " ")
    .trim().length;
}

function normalizeVisibleText(value) {
  return String(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function assertRouteDocument(route, html, config, errors) {
  const label = route.pathname;
  if (countMatches(html, /<title(?:\s[^>]*)?>[\s\S]*?<\/title>/gi) !== 1) errors.push(`${label}: expected exactly one title`);
  if (countMatches(html, /<meta\s+name=["']description["'][^>]*>/gi) !== 1) errors.push(`${label}: expected exactly one description`);
  if (countMatches(html, /<link\s+rel=["']canonical["'][^>]*>/gi) !== 1) errors.push(`${label}: expected exactly one canonical`);
  if (!html.includes(`href="${route.canonical}"`)) errors.push(`${label}: canonical does not match manifest`);
  if (route.canonical.includes("#") || route.canonical.includes("?")) errors.push(`${label}: canonical contains a fragment or query`);
  if (!html.includes(`<meta name="robots" content="${route.robots}"`)) errors.push(`${label}: robots metadata does not match indexability`);
  const h1Match = html.match(/<h1(?:\s[^>]*)?>([\s\S]*?)<\/h1>/i);
  if (!h1Match || !normalizeVisibleText(h1Match[1])) {
    errors.push(`${label}: prerendered HTML is missing a non-empty H1`);
  } else if (normalizeVisibleText(h1Match[1]) !== normalizeVisibleText(route.h1)) {
    errors.push(`${label}: H1 does not match the manifest contract`);
  }
  if (visibleTextLength(html) < 250) errors.push(`${label}: prerendered HTML has too little visible text`);
  const jsonLdBlocks = extractJsonLd(html);
  if (!jsonLdBlocks.length) errors.push(`${label}: JSON-LD is missing`);
  for (const block of jsonLdBlocks) {
    try {
      JSON.parse(block);
    } catch (error) {
      errors.push(`${label}: JSON-LD is invalid (${error.message})`);
    }
  }
}

function assertSitemap(sitemap, routes, config, errors) {
  if (!sitemap.startsWith('<?xml version="1.0" encoding="UTF-8"?>')) errors.push("sitemap.xml: XML declaration is missing");
  if (!/<urlset\s+xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">[\s\S]*<\/urlset>\s*$/i.test(sitemap)) {
    errors.push("sitemap.xml: urlset root is invalid");
  }
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  const expected = config.indexable ? routes.filter((route) => route.includeInSitemap).map((route) => route.canonical) : [];
  if (JSON.stringify(locations) !== JSON.stringify(expected)) errors.push("sitemap.xml: URLs do not match indexable manifest routes");
}

export async function verifyPublicSeo({ distDir = resolve("dist"), env = process.env } = {}) {
  const config = getPublicSiteConfig(env);
  const routes = createPublicRouteManifest(env);
  const errors = [];
  const titles = new Set();
  const descriptions = new Set();

  for (const route of routes) {
    if (titles.has(route.title)) errors.push(`${route.pathname}: duplicate title`);
    if (descriptions.has(route.description)) errors.push(`${route.pathname}: duplicate description`);
    titles.add(route.title);
    descriptions.add(route.description);
    const html = await readFile(resolve(distDir, route.outputFile), "utf8");
    assertRouteDocument(route, html, config, errors);
  }

  const [robots, sitemap] = await Promise.all([
    readFile(resolve(distDir, "robots.txt"), "utf8"),
    readFile(resolve(distDir, "sitemap.xml"), "utf8")
  ]);
  if (/<!doctype|<html/i.test(robots)) errors.push("robots.txt: must not contain HTML");
  if (config.indexable && !robots.includes(`Sitemap: ${config.origin}/sitemap.xml`)) errors.push("robots.txt: sitemap origin does not match configuration");
  if (!config.indexable && !/^User-agent: \*\nDisallow: \/\n$/u.test(robots)) errors.push("robots.txt: non-indexable build must disallow all crawling");
  assertSitemap(sitemap, routes, config, errors);

  if (errors.length) throw new Error(`Public SEO verification failed:\n- ${errors.join("\n- ")}`);
  return { routeCount: routes.length, indexable: config.indexable };
}

const directInvocation = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (directInvocation) {
  const result = await verifyPublicSeo();
  process.stdout.write(`Verified ${result.routeCount} public SEO routes (${result.indexable ? "indexable" : "noindex"}).\n`);
}
