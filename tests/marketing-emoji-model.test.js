import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { insertEmojiAtSelection } from "../src/features/marketing/marketingEmojiModel.js";

describe("marketing emoji insertion", () => {
  it("inserts an emoji at the cursor instead of always appending it", () => {
    assert.deepEqual(insertEmojiAtSelection("Добрый день", "👋", 7, 7), {
      cursor: 9,
      value: "Добрый 👋день"
    });
  });

  it("replaces the selected text and keeps the cursor after the emoji", () => {
    assert.deepEqual(insertEmojiAtSelection("Добрый день", "😊", 7, 11), {
      cursor: 9,
      value: "Добрый 😊"
    });
  });

  it("does not exceed the communication text limit", () => {
    assert.deepEqual(insertEmojiAtSelection("1234", "😊", 4, 4, 4), {
      cursor: 4,
      value: "1234"
    });
    assert.deepEqual(insertEmojiAtSelection("123", "😊", 3, 3, 4), {
      cursor: 3,
      value: "123"
    });
  });
});
