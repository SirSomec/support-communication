import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readWebSocketTextFrames } from "./websocket-frame-parser.js";

describe("runtime WebSocket frame parser", () => {
  it("unmasks client text frames before decoding UTF-8", () => {
    const payload = Buffer.from("masked message", "utf8");
    const mask = Buffer.from([0x12, 0x34, 0x56, 0x78]);
    const masked = Buffer.from(payload.map((byte, index) => byte ^ mask[index % 4]));
    const frame = Buffer.concat([Buffer.from([0x81, 0x80 | payload.length]), mask, masked]);

    const parsed = readWebSocketTextFrames(frame);

    assert.deepEqual(parsed.messages, ["masked message"]);
    assert.equal(parsed.remaining.length, 0);
  });
});
