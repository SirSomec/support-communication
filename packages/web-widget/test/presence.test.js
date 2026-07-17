import assert from "node:assert/strict";
import test from "node:test";

import { __test__ } from "../src/index.js";

test("widget defaults to the backend production environment", () => {
  assert.equal(__test__.defaultEnvironment, "production");
});

test("widget color overrides reject CSS injection payloads", () => {
  assert.equal(__test__.normalizeWidgetColor("#2563eb"), "#2563eb");
  assert.equal(__test__.normalizeWidgetColor("rgb(37, 99, 235)"), "rgb(37, 99, 235)");
  assert.equal(__test__.normalizeWidgetColor("red; } body { display:none"), "");
  assert.equal(__test__.normalizeWidgetColor("url(javascript:alert(1))"), "");
});

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

test("poll retries use bounded exponential backoff", () => {
  assert.equal(__test__.nextPollingDelay(3000, 0), 3000);
  assert.equal(__test__.nextPollingDelay(3000, 1), 6000);
  assert.equal(__test__.nextPollingDelay(3000, 4), 48000);
  assert.equal(__test__.nextPollingDelay(15000, 8), 300000);
});

test("widget URL resolution supports the documented relative api base", () => {
  assert.equal(
    __test__.resolveWidgetUrl("/api/v1", "/public/sdk/messages", "https://shop.example/catalog/item"),
    "https://shop.example/api/v1/public/sdk/messages"
  );
  assert.equal(
    __test__.resolveWidgetUrl("https://support.example/api/v1/", "public/sdk/messages", "https://shop.example/"),
    "https://support.example/api/v1/public/sdk/messages"
  );
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

test("only attachments with an http(s) signed download link are rendered", () => {
  const valid = {
    download: { expiresAt: "2026-07-13T12:15:00.000Z", url: "http://kubernetes.docker.internal:19000/pilot/objects/obj-1?X-Amz-Signature=abc" },
    fileId: "file-1",
    fileName: "invoice.pdf",
    mimeType: "application/pdf",
    sizeBytes: 2048
  };

  assert.deepEqual(__test__.downloadableAttachments([
    valid,
    null,
    { fileName: "no-download.bin" },
    { download: { url: "javascript:alert(1)" }, fileName: "evil.bin" },
    { download: { url: "" }, fileName: "empty.bin" }
  ]), [valid]);
  assert.deepEqual(__test__.downloadableAttachments("not-an-array"), []);
});

test("attachment size labels are humanized", () => {
  assert.equal(__test__.formatAttachmentSize(512), "512 Б");
  assert.equal(__test__.formatAttachmentSize(2048), "2.0 КБ");
  assert.equal(__test__.formatAttachmentSize(5 * 1024 * 1024), "5.0 МБ");
  assert.equal(__test__.formatAttachmentSize("unknown"), "");
  assert.equal(__test__.formatAttachmentSize(0), "");
});
