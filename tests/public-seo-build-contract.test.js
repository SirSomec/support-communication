import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { generatePublicSeoFiles } from "../scripts/generate-public-seo-files.mjs";
import { injectPublicSeoDocument } from "../scripts/prerender-public-pages.mjs";
import { verifyPublicSeo } from "../scripts/verify-public-seo.mjs";
import { createPublicRouteManifest } from "../src/public/seo/publicRouteManifest.js";

const temporaryDirectories = [];
const template = `<!doctype html><html lang="ru"><head><!-- PUBLIC_SEO_HEAD --><title>Template</title></head><body><div id="root"></div><script type="module" src="/assets/main.js"></script></body></html>`;

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function createFixture(env) {
  const distDir = await mkdtemp(join(tmpdir(), "support-public-seo-"));
  temporaryDirectories.push(distDir);
  const routes = createPublicRouteManifest(env);
  for (const route of routes) {
    const markup = `<main><nav>Support Communication</nav><h1>${route.h1}</h1><p>${route.description.repeat(4)}</p></main>`;
    const firstPass = injectPublicSeoDocument(template, route, routes, markup, env);
    const html = injectPublicSeoDocument(firstPass, route, routes, markup, env);
    assert.equal([...html.matchAll(/<h1(?:\s|>)/g)].length, 1, `${route.pathname} prerender must be idempotent`);
    const outputPath = join(distDir, route.outputFile);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, html, "utf8");
  }
  await generatePublicSeoFiles({ distDir, env });
  return { distDir, routes };
}

describe("public SEO build contract", () => {
  it("uses one manifest for unique metadata, canonical URLs and build outputs", () => {
    const routes = createPublicRouteManifest({ PUBLIC_SITE_INDEXABLE: "true" });
    assert.deepEqual(routes.map((route) => route.pathname), [
      "/",
      "/pricing/",
      "/docs/",
      "/website-support-chat/",
      "/ai-support-bot/",
      "/support-sla/"
    ]);
    assert.equal(new Set(routes.map((route) => route.title)).size, routes.length);
    assert.equal(new Set(routes.map((route) => route.description)).size, routes.length);
    for (const route of routes) {
      assert.match(route.canonical, /^https:\/\/supportcom\.ru\//);
      assert.doesNotMatch(route.canonical, /[#?]/);
      assert.ok(route.h1);
      assert.ok(route.includeInSitemap);
      assert.ok(route.title.length >= 50 && route.title.length <= 70);
      assert.ok(route.description.length >= 120 && route.description.length <= 170);
    }
  });

  it("keeps analytics disabled unless a valid build-time counter ID is supplied", () => {
    assert.equal(createPublicRouteManifest({ PUBLIC_SITE_METRIKA_ID: "" }).length, 6);
    assert.throws(
      () => createPublicRouteManifest({ PUBLIC_SITE_METRIKA_ID: "counter-from-runtime" }),
      /PUBLIC_SITE_METRIKA_ID/
    );
  });

  it("generates and verifies indexable prerendered documents", async () => {
    const env = { PUBLIC_SITE_ORIGIN: "https://supportcom.ru", PUBLIC_SITE_INDEXABLE: "true" };
    const { distDir, routes } = await createFixture(env);
    assert.deepEqual(await verifyPublicSeo({ distDir, env }), { routeCount: 6, indexable: true });
    const sitemap = await readFile(join(distDir, "sitemap.xml"), "utf8");
    assert.deepEqual([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]), routes.map((route) => route.canonical));
  });

  it("makes an explicitly non-indexable environment fail closed", async () => {
    const env = { PUBLIC_SITE_ORIGIN: "https://staging.example.test", PUBLIC_SITE_INDEXABLE: "false" };
    const { distDir } = await createFixture(env);
    assert.deepEqual(await verifyPublicSeo({ distDir, env }), { routeCount: 6, indexable: false });
    assert.equal(await readFile(join(distDir, "robots.txt"), "utf8"), "User-agent: *\nDisallow: /\n");
    assert.doesNotMatch(await readFile(join(distDir, "sitemap.xml"), "utf8"), /<loc>/);
    assert.doesNotMatch(await readFile(join(distDir, "index.html"), "utf8"), /https:\/\/supportcom\.ru/);
  });
});
