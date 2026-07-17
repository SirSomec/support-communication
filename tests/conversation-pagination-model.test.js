import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { normalizeConversationPagination } from "../src/features/dialogs/conversationPaginationModel.js";

describe("conversation inbox pagination", () => {
  it("derives bounded navigation state from backend pagination", () => {
    assert.deepEqual(normalizeConversationPagination({ page: 2, pageSize: 50, total: 123 }), {
      canNext: true,
      canPrevious: true,
      page: 2,
      pageCount: 3,
      pageSize: 50,
      total: 123
    });
    assert.equal(normalizeConversationPagination({ page: 9, pageSize: 50, total: 51 }).page, 2);
  });

  it("wires both queue footer buttons to server page loading", async () => {
    const source = await readFile(new URL("../src/features/dialogs/ConversationList.jsx", import.meta.url), "utf8");
    assert.match(source, /onPageChange\?\.\(page - 1\)/);
    assert.match(source, /onPageChange\?\.\(page \+ 1\)/);
    assert.match(source, /disabled=\{pageLoading \|\| !pagination\?\.canNext\}/);
  });
});
