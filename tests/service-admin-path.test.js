import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  legacyServiceAdminHashToPath,
  parseServiceAdminPath,
  serviceAdminPathForView
} from "../src/service-admin/serviceAdminPath.js";

describe("serviceAdminPath", () => {
  it("parses canonical pathnames", () => {
    assert.deepEqual(parseServiceAdminPath("/service-admin"), { view: "dashboard" });
    assert.deepEqual(parseServiceAdminPath("/service-admin/"), { view: "dashboard" });
    assert.deepEqual(parseServiceAdminPath("/service-admin/login"), { view: "login" });
    assert.equal(parseServiceAdminPath("/app"), null);
  });

  it("builds pathnames for views", () => {
    assert.equal(serviceAdminPathForView("login"), "/service-admin/login");
    assert.equal(serviceAdminPathForView("dashboard"), "/service-admin");
  });

  it("maps legacy hashes to pathnames", () => {
    assert.equal(legacyServiceAdminHashToPath("#/service-admin"), "/service-admin");
    assert.equal(legacyServiceAdminHashToPath("#/service-admin/login"), "/service-admin/login");
    assert.equal(legacyServiceAdminHashToPath("#/app"), null);
  });
});
