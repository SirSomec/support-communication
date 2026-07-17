import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { collectKnowledgeLoadErrors } from "../src/features/knowledge/knowledgeLoadModel.js";

describe("knowledge workspace load state", () => {
  it("surfaces failures from secondary tabs instead of rendering false empty states", () => {
    const ok = { status: "ok", data: {} };
    const errors = collectKnowledgeLoadErrors({
      articlesResponse: ok,
      sourcesResponse: ok,
      unansweredResponse: { status: "error", error: { message: "Questions unavailable" } },
      mcpResponse: { status: "error" },
      feedbackResponse: ok
    });

    assert.deepEqual(errors, ["Не удалось загрузить MCP-подключения.", "Questions unavailable"]);
  });
});
