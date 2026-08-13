import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const configPaths = ["docker/nginx.conf", "docker/nginx.static.conf"];
const configs = new Map(configPaths.map((path) => [path, readFileSync(path, "utf8")]));

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function exactLocation(config, path) {
  const match = config.match(new RegExp(`location\\s+=\\s+${escapeRegExp(path)}\\s*\\{([^{}]*)\\}`, "m"));
  assert.ok(match, `missing exact nginx location for ${path}`);
  return match[1];
}

describe("nginx public SEO HTTP contract", () => {
  for (const [configPath, config] of configs) {
    describe(configPath, () => {
      it("serves only the canonical public paths from their prerendered documents", () => {
        assert.match(exactLocation(config, "/"), /try_files\s+\/index\.html\s+=404;/);
        assert.match(exactLocation(config, "/pricing/"), /try_files\s+\/pricing\/index\.html\s+=404;/);
        assert.match(exactLocation(config, "/docs/"), /try_files\s+\/docs\/index\.html\s+=404;/);
        assert.match(exactLocation(config, "/legal/"), /try_files\s+\/legal\/index\.html\s+=404;/);
        assert.match(exactLocation(config, "/website-support-chat/"), /try_files\s+\/website-support-chat\/index\.html\s+=404;/);
        assert.match(exactLocation(config, "/ai-support-bot/"), /try_files\s+\/ai-support-bot\/index\.html\s+=404;/);
        assert.match(exactLocation(config, "/support-sla/"), /try_files\s+\/support-sla\/index\.html\s+=404;/);
        assert.match(exactLocation(config, "/helpdesk-small-business/"), /try_files\s+\/helpdesk-small-business\/index\.html\s+=404;/);
        assert.match(exactLocation(config, "/usedesk-alternative/"), /try_files\s+\/usedesk-alternative\/index\.html\s+=404;/);
        assert.match(exactLocation(config, "/jivo-alternative/"), /try_files\s+\/jivo-alternative\/index\.html\s+=404;/);
        assert.match(exactLocation(config, "/webim-alternative/"), /try_files\s+\/webim-alternative\/index\.html\s+=404;/);
      });

      it("permanently canonicalizes public and private legacy paths", () => {
        assert.match(config, /absolute_redirect\s+off;/, "redirects behind the edge proxy must keep relative Location headers");
        const redirects = new Map([
          ["/landing", "/"],
          ["/pricing", "/pricing/"],
          ["/docs", "/docs/"],
          ["/legal", "/legal/"],
          ["/legal/index.html", "/legal/"],
          ["/website-support-chat", "/website-support-chat/"],
          ["/website-support-chat/index.html", "/website-support-chat/"],
          ["/ai-support-bot", "/ai-support-bot/"],
          ["/ai-support-bot/index.html", "/ai-support-bot/"],
          ["/support-sla", "/support-sla/"],
          ["/support-sla/index.html", "/support-sla/"],
          ["/helpdesk-small-business", "/helpdesk-small-business/"],
          ["/helpdesk-small-business/index.html", "/helpdesk-small-business/"],
          ["/usedesk-alternative", "/usedesk-alternative/"],
          ["/usedesk-alternative/index.html", "/usedesk-alternative/"],
          ["/jivo-alternative", "/jivo-alternative/"],
          ["/jivo-alternative/index.html", "/jivo-alternative/"],
          ["/webim-alternative", "/webim-alternative/"],
          ["/webim-alternative/index.html", "/webim-alternative/"],
          ["/app", '"/#/app"'],
          ["/login", '"/#/login"'],
          ["/auth", '"/#/login"'],
          ["/onboarding", '"/#/onboarding"']
        ]);

        for (const [source, target] of redirects) {
          const location = exactLocation(config, source);
          assert.match(location, new RegExp(`return\\s+308\\s+${escapeRegExp(target)};`), `${source} must redirect to ${target}`);
        }
      });

      it("serves robots and sitemap as exact files with explicit media types", () => {
        const robots = exactLocation(config, "/robots.txt");
        assert.match(robots, /default_type\s+text\/plain;/);
        assert.match(robots, /try_files\s+\/robots\.txt\s+=404;/);

        const sitemap = exactLocation(config, "/sitemap.xml");
        assert.match(sitemap, /default_type\s+application\/xml;/);
        assert.match(sitemap, /try_files\s+\/sitemap\.xml\s+=404;/);
      });

      it("uses hard 404s instead of the SPA shell for unknown paths and assets", () => {
        assert.match(config, /error_page\s+404\s+\/404\.html;/);
        assert.match(config, /location\s+\^~\s+\/assets\/\s*\{\s*try_files\s+\$uri\s+=404;\s*\}/m);
        const catchAll = config.match(/location\s+\/\s*\{([^{}]*)\}/m);
        assert.ok(catchAll, "missing root catch-all location");
        assert.match(catchAll[1], /try_files\s+\$uri\s+\$uri\/\s+=404;/);
        assert.doesNotMatch(catchAll[1], /\/index\.html/, "catch-all SPA fallback must not return a soft 404");
      });

      it("keeps technical surfaces and the custom 404 out of search", () => {
        assert.match(config, /add_header\s+X-Robots-Tag\s+\$seo_x_robots_tag\s+always;/);
        assert.match(config, /map\s+"\$request_uri:\$status"\s+\$seo_x_robots_tag/);
        assert.match(config, /~\^\/service-admin\(\?:\[\/\?\]\|:\)\s+"noindex, nofollow";/);
        assert.match(config, /~\^\/\(\?:api\|s3\)\(\?:\[\/\?\]\|:\)\s+"noindex, nofollow";/);
        assert.match(config, /~:404\$\s+"noindex, nofollow";/);
        assert.match(exactLocation(config, "/service-admin"), /try_files\s+\/service-admin\/index\.html\s+=404;/);
        assert.match(config, /location\s+\^~\s+\/service-admin\/\s*\{/);
      });

      it("caches only successful hashed assets for one year", () => {
        assert.match(config, /map\s+"\$request_uri:\$status"\s+\$seo_cache_control/);
        assert.match(config, /~\^\/assets\/.+\(\?:200\|206\|304\)\$\s+"public, max-age=31536000, immutable";/);
        assert.match(config, /default\s+"no-store";/);
        assert.match(config, /robots\\\.txt\|sitemap\\\.xml.+"public, max-age=300, must-revalidate";/);
      });
    });
  }

  it("preserves the API, SSE and S3 proxy behavior in the compose frontend", () => {
    const config = configs.get("docker/nginx.conf");
    assert.match(config, /location\s+=\s+\/api\/v1\/realtime\/events\/stream\s*\{/);
    assert.match(config, /proxy_buffering\s+off;/);
    assert.match(config, /proxy_read_timeout\s+1h;/);
    assert.match(config, /location\s+\/api\/\s*\{/);
    assert.match(config, /proxy_pass\s+http:\/\/\$api_gateway_upstream\$request_uri;/);
    assert.match(config, /location\s+\/s3\/\s*\{/);
    assert.match(config, /proxy_request_buffering\s+off;/);
    assert.match(config, /rewrite\s+\^\/s3\/\(\.\*\)\$\s+\/\$1\s+break;/);
  });

  it("allows the configured analytics script providers through CSP", () => {
    for (const path of ["deploy/caddy/Caddyfile", "deploy/caddy/Caddyfile.vps"]) {
      const caddyfile = readFileSync(path, "utf8");
      assert.match(caddyfile, /script-src 'self' https:\/\/mc\.yandex\.ru https:\/\/yastatic\.net https:\/\/www\.googletagmanager\.com;/);
    }

    assert.match(configs.get("docker/nginx.conf"), /script-src 'self' https:\/\/mc\.yandex\.ru https:\/\/yastatic\.net https:\/\/www\.googletagmanager\.com;/);
  });

  it("ships a lightweight, noindex 404 document with recovery links", () => {
    const page = readFileSync("public/404.html", "utf8");
    assert.match(page, /<meta\s+name="robots"\s+content="noindex, nofollow"\s*\/>/);
    assert.match(page, /<h1>[^<]+<\/h1>/);
    assert.match(page, /href="\/"/);
    assert.match(page, /href="\/pricing\/"/);
    assert.match(page, /href="\/docs\/"/);
    assert.match(page, /href="\/website-support-chat\/"/);
    assert.match(page, /href="\/ai-support-bot\/"/);
    assert.match(page, /href="\/support-sla\/"/);
    assert.doesNotMatch(page, /<script\b/i);
  });
});
