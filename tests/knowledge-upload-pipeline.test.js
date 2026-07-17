import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { uploadKnowledgeDocumentFiles } from "../src/features/knowledge/knowledgeUploadPipeline.js";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe("knowledge upload pipeline batching", () => {
  it("runs at most `concurrency` uploads at once and keeps outcome order", async () => {
    const files = Array.from({ length: 7 }, (_, index) => ({ name: `f${index}.md` }));
    let running = 0;
    let peak = 0;
    const outcomes = await uploadKnowledgeDocumentFiles(files, {
      concurrency: 3,
      uploadOne: async (file) => {
        running += 1;
        peak = Math.max(peak, running);
        await delay(10 + Math.random() * 20);
        running -= 1;
        return { fileName: file.name, ok: true };
      }
    });
    assert.equal(peak <= 3, true, `peak=${peak}`);
    assert.equal(peak >= 2, true, "параллель фактически используется");
    assert.deepEqual(outcomes.map((outcome) => outcome.fileName), files.map((file) => file.name));
  });

  it("reports done counts and per-file outcomes through onProgress", async () => {
    const files = [{ name: "a.md" }, { name: "b.md" }];
    const events = [];
    await uploadKnowledgeDocumentFiles(files, {
      concurrency: 1,
      onProgress: (progress) => events.push({ ...progress }),
      uploadOne: async (file) => ({ fileName: file.name, ok: file.name !== "b.md" })
    });
    assert.deepEqual(events.filter((event) => event.outcome).map((event) => [event.done, event.fileName, event.outcome.ok]), [
      [1, "a.md", true],
      [2, "b.md", false]
    ]);
    assert.equal(events[0].done, 0);
    assert.equal(events[0].total, 2);
  });

  it("keeps a failed file from stopping the rest of the batch", async () => {
    const files = [{ name: "a.md" }, { name: "boom.md" }, { name: "c.md" }];
    const outcomes = await uploadKnowledgeDocumentFiles(files, {
      concurrency: 2,
      uploadOne: async (file) => file.name === "boom.md"
        ? { fileName: file.name, ok: false, reason: "антивирус" }
        : { fileName: file.name, ok: true }
    });
    assert.deepEqual(outcomes.map((outcome) => outcome.ok), [true, false, true]);
  });
});
