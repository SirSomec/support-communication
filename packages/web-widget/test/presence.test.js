import assert from "node:assert/strict";
import test from "node:test";

import { __test__ } from "../src/index.js";

test("anonymous identity remains stable in the supplied storage", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };

  const first = __test__.getOrCreateIdentity(storage, "subject", "visitor");
  const second = __test__.getOrCreateIdentity(storage, "subject", "visitor");

  assert.match(first, /^visitor-/);
  assert.equal(second, first);
});

test("identity creation still works when browser storage is unavailable", () => {
  const brokenStorage = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); }
  };

  assert.match(__test__.getOrCreateIdentity(brokenStorage, "subject", "visitor"), /^visitor-/);
});

test("presence heartbeat interval rejects overly aggressive values", () => {
  assert.equal(__test__.normalizeInterval(8000), 8000);
  assert.equal(__test__.normalizeInterval(1000), 15000);
  assert.equal(__test__.normalizeInterval("invalid"), 15000);
});

test("invitation polling ignores malformed entries and selects the first valid exposure", () => {
  const invitation = __test__.firstInvitation([
    null,
    { exposureId: "" },
    { exposureId: "exposure-42", message: "Can we help?" },
    { exposureId: "exposure-later" }
  ]);

  assert.deepEqual(invitation, { exposureId: "exposure-42", message: "Can we help?" });
  assert.equal(__test__.firstInvitation({ invitations: [] }), null);
});

test("invitation acknowledgement path encodes the exposure identifier", () => {
  assert.equal(
    __test__.invitationAcknowledgePath("exposure/42", "accepted"),
    "/public/sdk/invitations/exposure%2F42/accepted"
  );
});
