import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPublishChecklist } from "../src/features/automation/automationModel.js";

const pendingSource = { approvalStatus: "pending", id: "src-pending", readiness: "stale", status: "ready", title: "Ждёт индексации" };
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

describe("publish checklist without source approval gates", () => {
  it("never adds a source readiness item — bound sources are used unconditionally", () => {
    const checklist = buildPublishChecklist(scenarioWith([{ sourceId: "src-pending" }, { sourceId: "src-indexing" }, { sourceId: "missing" }]), {
      aiReadiness: { status: "ready" },
      knowledgeSources: [pendingSource, indexingSource]
    });
    assert.equal(checklist.items.some((entry) => entry.id === "sources-ready"), false);
    assert.equal(checklist.canPublish, true);
  });

  it("still requires at least one bound source for ai scenarios using the draft set", () => {
    const withDraftEmpty = buildPublishChecklist(
      scenarioWith([{ sourceId: "src-pending" }], { draft: { sourceBindings: [] }, status: "published" }),
      { aiReadiness: { status: "ready" }, knowledgeSources: [pendingSource] }
    );
    assert.equal(withDraftEmpty.items.find((entry) => entry.id === "sources")?.ok, false);
    assert.equal(withDraftEmpty.canPublish, false);

    const withDraftBindings = buildPublishChecklist(
      scenarioWith([], { draft: { sourceBindings: [{ sourceId: "src-pending" }] }, status: "published" }),
      { aiReadiness: { status: "ready" }, knowledgeSources: [pendingSource] }
    );
    assert.equal(withDraftBindings.items.find((entry) => entry.id === "sources")?.ok, true);
    assert.equal(withDraftBindings.canPublish, true);
  });

  it("keeps ai readiness as the remaining blocking gate", () => {
    const checklist = buildPublishChecklist(scenarioWith([{ sourceId: "src-pending" }]), {
      aiReadiness: { status: "not_configured" },
      knowledgeSources: [pendingSource]
    });
    assert.equal(checklist.items.find((entry) => entry.id === "ai")?.ok, false);
    assert.equal(checklist.canPublish, false);
  });
});
