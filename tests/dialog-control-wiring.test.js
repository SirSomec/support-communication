import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("dialog control wiring", () => {
  it("wires the client copy action to the clipboard service", async () => {
    const source = await readFile(new URL("../src/features/dialogs/CustomerPanel.jsx", import.meta.url), "utf8");
    assert.match(source, /copyTextToClipboard\(/);
    assert.match(source, /onClick=\{\(\) => void copyClientSummary\(\)\}/);
  });

  it("wires the chat information action to a visible details panel", async () => {
    const source = await readFile(new URL("../src/features/dialogs/ChatHeader.jsx", import.meta.url), "utf8");
    assert.match(source, /aria-expanded=\{isInfoPanelOpen\}/);
    assert.match(source, /onClick=\{\(\) => setInfoPanelOpen/);
    assert.match(source, /className="chat-info-panel"/);
  });
});
