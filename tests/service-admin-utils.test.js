import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatDateTime } from "../src/features/service-admin/serviceAdminUtils.js";

describe("service-admin UI formatters", () => {
  it("does not throw when runtime timestamps are missing or invalid", () => {
    assert.doesNotThrow(() => formatDateTime(null));
    assert.doesNotThrow(() => formatDateTime("10:12"));
    assert.equal(typeof formatDateTime("10:12"), "string");
  });
});
