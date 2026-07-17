import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mergeScenarioSourceBindings,
  selectApprovableSources,
  summarizeBulkAction,
  summarizeBulkUpload
} from "../src/features/knowledge/knowledgeBulkModel.js";

describe("knowledge bulk operations model", () => {
  it("selects only ready sources that wait for approval", () => {
    const sources = [
      { approvalStatus: "pending", id: "a", status: "ready" },
      { approvalStatus: "approved", id: "b", status: "ready" },
      { approvalStatus: "pending", id: "c", status: "indexing" },
      { approvalStatus: "pending", id: "d", status: "failed" },
      null
    ];
    assert.deepEqual(selectApprovableSources(sources).map((source) => source.id), ["a"]);
    assert.deepEqual(selectApprovableSources(undefined), []);
  });

  it("summarizes a fully queued upload batch with singular and plural wording", () => {
    assert.match(summarizeBulkUpload([{ fileName: "faq.txt", ok: true }]), /Файл в очереди индексации/);
    const plural = summarizeBulkUpload([
      { fileName: "faq.txt", ok: true },
      { fileName: "returns.md", ok: true },
      { fileName: "delivery.html", ok: true }
    ]);
    assert.match(plural, /Все файлы в очереди индексации: 3/);
    assert.match(plural, /Одобрить готовые/);
  });

  it("lists failed files with reasons and caps the visible list", () => {
    const outcomes = [
      { fileName: "ok.txt", ok: true },
      { fileName: "virus.txt", ok: false, reason: "файл не прошёл антивирусную проверку" },
      { fileName: "b.txt", ok: false },
      { fileName: "c.txt", ok: false, reason: "нет ответа" },
      { fileName: "d.txt", ok: false, reason: "нет ответа" }
    ];
    const message = summarizeBulkUpload(outcomes);
    assert.match(message, /В очереди индексации: 1 из 5/);
    assert.match(message, /virus\.txt \(файл не прошёл антивирусную проверку\)/);
    assert.match(message, /b\.txt \(неизвестная ошибка\)/);
    assert.match(message, /и ещё 1/);
    assert.doesNotMatch(message, /d\.txt/);
  });

  it("summarizes bulk action results per action including skipped sources", () => {
    assert.match(summarizeBulkAction("approve", { affected: [{ id: "a" }, { id: "b" }], skipped: [] }), /Одобрено источников: 2\. Бот сможет отвечать по ним\./);
    const mixed = summarizeBulkAction("approve", { affected: [{ id: "a" }], skipped: [{ code: "knowledge_source_not_ready", sourceId: "b" }] });
    assert.match(mixed, /Одобрено источников: 1/);
    assert.match(mixed, /Пропущено: 1/);
    assert.match(summarizeBulkAction("approve", { affected: [], skipped: [] }), /Ни один источник не одобрен/);
    assert.match(summarizeBulkAction("disable", { affected: [{ id: "a" }], skipped: [] }), /Отключено источников: 1/);
    assert.match(summarizeBulkAction("enable", { affected: [], skipped: [{ code: "x", sourceId: "a" }] }), /Ничего не включено\. Пропущено: 1/);
    assert.match(summarizeBulkAction("archive", { affected: [{ id: "a" }], skipped: [] }), /Перемещено в архив: 1/);
    assert.match(summarizeBulkAction("delete", { affected: [{ id: "a" }], skipped: [] }), /Удалено источников: 1/);
  });

  it("merges scenario bindings with selected documents preferring the draft set", () => {
    const scenario = {
      draft: { sourceBindings: [{ sourceId: "draft-a" }] },
      sourceBindings: [{ sourceId: "published-b" }]
    };
    const merged = mergeScenarioSourceBindings(scenario, [{ id: "draft-a" }, { id: "doc-new" }, { id: "doc-new" }, null]);
    assert.equal(merged.additions, 1);
    assert.deepEqual(merged.merged, [{ sourceId: "draft-a" }, { sourceId: "doc-new" }]);

    const withoutDraft = mergeScenarioSourceBindings({ sourceBindings: [{ sourceId: "published-b" }] }, [{ id: "doc-new" }]);
    assert.deepEqual(withoutDraft.merged, [{ sourceId: "published-b" }, { sourceId: "doc-new" }]);
    assert.equal(mergeScenarioSourceBindings(null, [{ id: "doc-new" }]).additions, 1);
  });
});
