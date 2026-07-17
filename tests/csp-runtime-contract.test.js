import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const nginxConfig = readFileSync(new URL("../docker/nginx.conf", import.meta.url), "utf8");

describe("frontend Content-Security-Policy", () => {
  it("serves one strict CSP header for both frontend entrypoints", () => {
    const matches = [...nginxConfig.matchAll(/add_header\s+Content-Security-Policy\s+"([^"]+)"\s+always;/g)];
    assert.equal(matches.length, 1, "CSP must be defined once at server scope");
    assert.ok(matches[0].index < nginxConfig.indexOf("location "), "server-level CSP must precede every location");

    const directives = new Map(
      matches[0][1].split(";").map((directive) => directive.trim()).filter(Boolean).map((directive) => {
        const [name, ...values] = directive.split(/\s+/);
        return [name, values];
      })
    );

    for (const [name, expected] of [
      ["default-src", ["'self'"]],
      ["base-uri", ["'self'"]],
      ["object-src", ["'none'"]],
      ["frame-ancestors", ["'none'"]],
      ["form-action", ["'self'"]],
      ["script-src", ["'self'"]]
    ]) {
      assert.deepEqual(directives.get(name), expected, `${name} must stay fail-closed`);
    }
    assert.ok(directives.get("style-src")?.includes("'unsafe-inline'"), "temporary dynamic-style compatibility must be explicit");
    assert.ok(!directives.get("script-src")?.includes("'unsafe-inline'"));
    assert.ok(!directives.get("script-src")?.includes("'unsafe-eval'"));
  });

  for (const entrypoint of ["index.html", "service-admin/index.html"]) {
    it(`${entrypoint} contains external scripts only`, () => {
      const html = readFileSync(new URL(`../${entrypoint}`, import.meta.url), "utf8");
      const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];

      assert.ok(scripts.length > 0);
      for (const [, attributes, body] of scripts) {
        assert.match(attributes, /\bsrc=(?:"[^"]+"|'[^']+')/i);
        assert.equal(body.trim(), "");
      }
    });
  }
});
