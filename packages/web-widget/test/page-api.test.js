import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { __test__ } from "../src/index.js";

test("stage-key demo snippets select the stage environment explicitly", () => {
  const demo = readFileSync(new URL("../public/demo.html", import.meta.url), "utf8");
  assert.match(demo, /<script src="\/widget\.js"><\/script>/);
  assert.doesNotMatch(demo, /\/dist\/widget\.js/);
  const snippets = [...demo.matchAll(/SupportWidget\.init\(\{([\s\S]*?)\}\);/g)].map((match) => match[1]);
  assert.equal(snippets.length, 2);
  for (const snippet of snippets) {
    assert.match(snippet, /environment:\s*"stage"/);
    assert.match(snippet, /publicKey:\s*"sk_stage_/);
  }
});

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

test("accepted invitations require and retain a scoped conversation session", () => {
  assert.deepEqual(__test__.acceptedInvitationSession({
    conversationId: "conv-1",
    visitorSessionToken: "visitor-token"
  }), {
    conversationId: "conv-1",
    visitorSessionToken: "visitor-token"
  });
  assert.throws(() => __test__.acceptedInvitationSession({ conversationId: "conv-1" }), /conversation session/);
});

test("history clearing rotates every live anonymous identity field", () => {
  const localValues = new Map([["support-widget:subject-id", "visitor-old"]]);
  const sessionValues = new Map([["support-widget:session-id", "session-old"]]);
  const storage = (values) => ({
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value)
  });
  const target = { externalId: "visitor-old", sessionId: "session-old", subjectId: "visitor-old" };

  __test__.resetWidgetIdentity(target, storage(localValues), storage(sessionValues));

  assert.match(target.subjectId, /^visitor-/);
  assert.match(target.sessionId, /^session-/);
  assert.notEqual(target.subjectId, "visitor-old");
  assert.notEqual(target.sessionId, "session-old");
  assert.equal(target.externalId, target.subjectId);
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
