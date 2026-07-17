import assert from "node:assert/strict";
import test from "node:test";

import { __test__ } from "../src/index.js";

test("utm parameters are captured from the first-visit query string", () => {
  const utm = __test__.parseUtmParams("?utm_source=ads&utm_medium=cpc&utm_campaign=spring&x=1");
  assert.deepEqual(utm, { campaign: "spring", medium: "cpc", source: "ads" });
  assert.equal(__test__.parseUtmParams("?page=2"), null);
});

test("page api object exposes the documented control surface", () => {
  const api = __test__.createPageApi();
  const methods = [
    "chatMode", "clearHistory", "close", "getContactInfo", "getUnreadMessagesCount",
    "getUtm", "getVisitorNumber", "isCallbackEnabled", "open", "sendOfflineMessage",
    "sendPageTitle", "setClientAttributes", "setContactInfo", "setCustomData",
    "setRules", "setUserToken", "setWidgetColor", "showProactiveInvitation", "startCall"
  ];
  for (const method of methods) {
    assert.equal(typeof api[method], "function", `missing method ${method}`);
  }
});

test("telephony methods respond with the disabled-calls contract", () => {
  const api = __test__.createPageApi();
  assert.deepEqual(api.startCall("+70000000000"), { result: "fail", reason: "calls_not_available" });
  let callbackResult = null;
  api.isCallbackEnabled((result) => { callbackResult = result; });
  assert.deepEqual(callbackResult, { result: "fail", reason: "calls_not_available" });
});

test("utm getter returns a null-filled object before capture", () => {
  const api = __test__.createPageApi();
  const utm = api.getUtm();
  assert.deepEqual(Object.keys(utm).sort(), ["campaign", "content", "medium", "source", "term"]);
});

test("offline message requires text", () => {
  const api = __test__.createPageApi();
  assert.deepEqual(api.sendOfflineMessage({ name: "A" }), { result: "fail", error: "message_required" });
});

test("local invitations are recognised by their exposure prefix", () => {
  assert.equal(__test__.isLocalInvitation({ exposureId: "local-x" }), true);
  assert.equal(__test__.isLocalInvitation({ exposureId: "exposure-1" }), false);
  assert.equal(__test__.isLocalInvitation(null), false);
});

test("page callbacks fan out to every alias prefix", () => {
  globalThis.window = {};
  try {
    const seen = [];
    globalThis.window.sw_onOpen = () => seen.push("sw");
    globalThis.window.jivo_onOpen = () => seen.push("compat");
    globalThis.window.jivo_onClose = () => { throw new Error("must be swallowed"); };
    __test__.callPageCallback("onOpen");
    __test__.callPageCallback("onClose");
    assert.deepEqual(seen, ["sw", "compat"]);
  } finally {
    delete globalThis.window;
  }
});

test("a follow-up conversation resets conversation-scoped rating and accept flags", () => {
  const conversationState = {
    conversationId: "appeal-1",
    lastOperatorMessageId: "msg-9",
    operatorAccepted: true,
    ratingSubmitted: true
  };

  assert.equal(__test__.applyConversationIdentity(conversationState, "appeal-2"), true);
  assert.deepEqual(conversationState, {
    conversationId: "appeal-2",
    lastOperatorMessageId: null,
    operatorAccepted: false,
    ratingSubmitted: false
  });
  assert.equal(__test__.applyConversationIdentity(conversationState, "appeal-2"), false);
});
