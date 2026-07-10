import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("clipboard service", () => {
  it("copies text through the Clipboard API when available", async () => {
    const { copyTextToClipboard } = await import("../src/services/clipboardService.js");
    let copied = "";

    const result = await copyTextToClipboard("audit-json", {
      clipboard: {
        writeText: async (value) => {
          copied = value;
        }
      }
    });

    assert.equal(result.ok, true);
    assert.equal(result.method, "clipboard-api");
    assert.equal(copied, "audit-json");
  });

  it("falls back to a textarea copy command when Clipboard API fails", async () => {
    const { copyTextToClipboard } = await import("../src/services/clipboardService.js");
    const appended = [];
    const removed = [];
    const fakeTextarea = {
      focus() {},
      select() {},
      setAttribute() {},
      style: {},
      value: ""
    };
    const result = await copyTextToClipboard("sdk-snippet", {
      clipboard: {
        writeText: async () => {
          throw new Error("permission denied");
        }
      },
      documentRef: {
        body: {
          appendChild: (node) => appended.push(node),
          removeChild: (node) => removed.push(node)
        },
        createElement: () => fakeTextarea,
        execCommand: (command) => command === "copy"
      }
    });

    assert.equal(result.ok, true);
    assert.equal(result.method, "exec-command");
    assert.equal(fakeTextarea.value, "sdk-snippet");
    assert.deepEqual(appended, [fakeTextarea]);
    assert.deepEqual(removed, [fakeTextarea]);
  });

  it("fails closed when there is no text or available clipboard mechanism", async () => {
    const { copyTextToClipboard } = await import("../src/services/clipboardService.js");

    const empty = await copyTextToClipboard(" ");
    const unavailable = await copyTextToClipboard("payload", { clipboard: null, documentRef: null });

    assert.equal(empty.ok, false);
    assert.equal(empty.code, "empty_clipboard_payload");
    assert.equal(unavailable.ok, false);
    assert.equal(unavailable.code, "clipboard_unavailable");
  });
});
