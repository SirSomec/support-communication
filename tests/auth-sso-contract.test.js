import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("SSO form sends domain and a distinct supported OIDC provider id", () => {
  const page = readFileSync(new URL("../src/features/auth/AuthPage.jsx", import.meta.url), "utf8");
  const model = readFileSync(new URL("../src/features/auth/authModel.js", import.meta.url), "utf8");

  assert.match(page, /startOidcLogin\(\{\s*domain,\s*providerId:/s);
  assert.match(page, /Microsoft Entra ID[\s\S]*oidc-entra/);
  assert.match(page, /Okta[\s\S]*oidc-okta/);
  assert.doesNotMatch(model, /"SAML"/);
});
