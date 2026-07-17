import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  selectApprovableSources,
  summarizeBulkApprove,
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

  it("summarizes bulk approve results including skipped sources", () => {
    assert.match(summarizeBulkApprove({ approved: [{ id: "a" }, { id: "b" }], skipped: [] }), /Одобрено источников: 2/);
    const mixed = summarizeBulkApprove({ approved: [{ id: "a" }], skipped: [{ code: "knowledge_source_not_ready", sourceId: "b" }] });
    assert.match(mixed, /Одобрено источников: 1/);
    assert.match(mixed, /Пропущено: 1/);
    assert.match(summarizeBulkApprove({ approved: [], skipped: [] }), /Ни один источник не одобрен/);
  });
});
