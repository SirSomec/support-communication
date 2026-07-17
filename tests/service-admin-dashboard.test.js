import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("service-admin dashboard guards", () => {
  it("handles auth-state API failures before reading envelope data", () => {
    const source = readFileSync(new URL("../src/features/service-admin/ServiceAdminDashboard.jsx", import.meta.url), "utf8");
    const handler = source.slice(
      source.indexOf("async function handleRefreshAuthState"),
      source.indexOf("useEffect", source.indexOf("async function handleRefreshAuthState"))
    );

    assert.match(handler, /envelope\.status !== "ok" \|\| !envelope\.data/);
    assert.ok(handler.indexOf("!envelope.data") < handler.indexOf("envelope.data.authenticated"));
  });
});
