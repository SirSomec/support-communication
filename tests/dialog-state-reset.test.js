import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("dialog-local state reset contracts", () => {
  it("resets the close outcome and bot feedback when the selected conversation changes", () => {
    const toolbar = readFileSync("src/features/dialogs/TranscriptToolbar.jsx", "utf8");
    const handoff = readFileSync("src/features/dialogs/BotHandoffSummary.jsx", "utf8");
    const pane = readFileSync("src/features/dialogs/ChatPane.jsx", "utf8");

    assert.match(toolbar, /useEffect\(\(\) => \{\s*setResolutionOutcome\("resolved"\);\s*\}, \[conversationId\]\)/);
    assert.match(pane, /<TranscriptToolbar[\s\S]*conversationId=\{conversation\.id\}/);
    assert.match(handoff, /useEffect\(\(\) => \{\s*setSelected\(null\);\s*setStatus\("idle"\);\s*setError\(""\);\s*\}, \[conversationId\]\)/);
  });

  it("marks client history as fetched only after a successful response", () => {
    const panel = readFileSync("src/features/dialogs/CustomerPanel.jsx", "utf8");
    const requestIndex = panel.indexOf("dialogService.fetchDialogs");
    const successIndex = panel.indexOf('if (response.status === "ok")', requestIndex);
    const markerIndex = panel.indexOf("historyFetchedForRef.current = conversation.id", requestIndex);

    assert.ok(requestIndex >= 0);
    assert.ok(successIndex > requestIndex);
    assert.ok(markerIndex > successIndex);
  });

  it("resets transcript pinning when the selected conversation changes", () => {
    const timeline = readFileSync("src/features/dialogs/AuditTimeline.jsx", "utf8");
    const pane = readFileSync("src/features/dialogs/ChatPane.jsx", "utf8");

    assert.match(timeline, /pinnedToBottomRef\.current = true;\s*userScrollIntentRef\.current = false;[\s\S]*\}, \[conversationId\]\);/);
    assert.match(pane, /<AuditTimeline[\s\S]*conversationId=\{conversation\.id\}/);
  });

  it("does not keep the unused attachment completion callback in the dialog tree", () => {
    const sources = [
      "src/App.jsx",
      "src/app/useComposerAttachments.js",
      "src/features/dialogs/DialogWorkspace.jsx",
      "src/features/dialogs/ChatPane.jsx",
      "src/features/dialogs/Composer.jsx"
    ].map((file) => readFileSync(file, "utf8")).join("\n");

    assert.doesNotMatch(sources, /onAttachmentComplete|completeAttachment/);
  });
});
