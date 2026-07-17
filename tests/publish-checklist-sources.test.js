import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPublishChecklist } from "../src/features/automation/automationModel.js";

const readySource = { approvalStatus: "approved", id: "src-ready", readiness: "ready", status: "ready", title: "Готовый" };
const pendingSource = { approvalStatus: "pending", id: "src-pending", readiness: "stale", status: "ready", title: "Ждёт одобрения" };
const indexingSource = { approvalStatus: "pending", id: "src-indexing", readiness: "not_ready", status: "indexing", title: "Индексируется" };

function scenarioWith(bindings, extra = {}) {
  return {
    channels: ["SDK"],
    flowNodes: [{ id: "ai", type: "ai_reply" }, { id: "handoff", type: "handoff" }],
    name: "Бот",
    sourceBindings: bindings,
    triggerRules: [{ type: "new_conversation" }],
    ...extra
  };
}

describe("publish checklist knowledge source readiness", () => {
  it("passes when every bound source is ready and approved", () => {
    const checklist = buildPublishChecklist(scenarioWith([{ sourceId: "src-ready" }]), {
      aiReadiness: { status: "ready" },
      knowledgeSources: [readySource]
    });
    const item = checklist.items.find((entry) => entry.id === "sources-ready");
    assert.equal(item?.ok, true);
    assert.equal(checklist.unavailableSources.length, 0);
    assert.equal(checklist.canPublish, true);
  });

  it("blocks publication and lists pending or unknown sources with approvable flag", () => {
    const checklist = buildPublishChecklist(scenarioWith([{ sourceId: "src-pending" }, { sourceId: "src-indexing" }, { sourceId: "missing" }]), {
      aiReadiness: { status: "ready" },
      knowledgeSources: [pendingSource, indexingSource]
    });
    const item = checklist.items.find((entry) => entry.id === "sources-ready");
    assert.equal(item?.ok, false);
    assert.equal(item?.blocking, true);
    assert.equal(checklist.canPublish, false);
    assert.deepEqual(checklist.unavailableSources.map((entry) => [entry.sourceId, entry.approvable]), [
      ["src-pending", true],
      ["src-indexing", false],
      ["missing", false]
    ]);
  });

  it("checks draft bindings when a published scenario has draft changes", () => {
    const checklist = buildPublishChecklist(
      scenarioWith([{ sourceId: "src-ready" }], { draft: { sourceBindings: [{ sourceId: "src-pending" }] }, status: "published" }),
      { aiReadiness: { status: "ready" }, knowledgeSources: [readySource, pendingSource] }
    );
    assert.equal(checklist.items.find((entry) => entry.id === "sources-ready")?.ok, false);
    assert.deepEqual(checklist.unavailableSources.map((entry) => entry.sourceId), ["src-pending"]);
  });

  it("keeps scenarios without ai or bindings unaffected", () => {
    const checklist = buildPublishChecklist({
      channels: ["SDK"],
      flowNodes: [{ id: "start", type: "message" }],
      name: "Без AI",
      sourceBindings: [],
      triggerRules: [{ type: "new_conversation" }]
    }, { knowledgeSources: [] });
    assert.equal(checklist.items.some((entry) => entry.id === "sources-ready"), false);
    assert.equal(checklist.canPublish, true);
  });
});
