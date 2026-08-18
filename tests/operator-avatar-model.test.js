import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import {
  STANDARD_OPERATOR_AVATARS,
  getStandardOperatorAvatar,
  getStandardOperatorAvatarBySrc
} from "../src/features/operators/avatarCatalog.js";
import {
  OPERATOR_AVATAR_MAX_BYTES,
  isCustomOperatorAvatar,
  operatorAvatarBytesFromDataUrl,
  operatorAvatarPayload,
  operatorAvatarSelection
} from "../src/features/operators/avatarModel.js";
import { mergeReportOperatorRows } from "../src/features/reports/model/reportBreakdownModel.js";

describe("operator avatars", () => {
  it("ships 20 selectable standard images under the storage limit", () => {
    const avatarDirectory = resolve("public/avatars");
    const files = readdirSync(avatarDirectory).filter((name) => /^operator-\d{2}\.png$/.test(name)).sort();

    assert.equal(STANDARD_OPERATOR_AVATARS.length, 20);
    assert.deepEqual(files, STANDARD_OPERATOR_AVATARS.map((avatar) => `${avatar.id}.png`));

    for (const [index, avatar] of STANDARD_OPERATOR_AVATARS.entries()) {
      assert.equal(avatar.id, `operator-${String(index + 1).padStart(2, "0")}`);
      assert.equal(avatar.src, `/avatars/${avatar.id}.png`);
      assert.equal(getStandardOperatorAvatar(avatar.id), avatar);
      assert.equal(getStandardOperatorAvatarBySrc(`https://workspace.example.test${avatar.src}`), avatar);
      assert.ok(statSync(resolve(avatarDirectory, `${avatar.id}.png`)).size <= OPERATOR_AVATAR_MAX_BYTES);
    }
  });

  it("accepts only catalog presets and safe custom image data", () => {
    const custom = "data:image/png;base64,AQIDBA==";

    assert.deepEqual(operatorAvatarSelection("/avatars/operator-07.png"), { kind: "preset", presetId: "operator-07" });
    assert.deepEqual(operatorAvatarSelection(custom), { dataUrl: custom, kind: "custom" });
    assert.equal(isCustomOperatorAvatar(custom), true);
    assert.equal(isCustomOperatorAvatar("data:text/html;base64,PHNjcmlwdD4="), false);
    assert.equal(operatorAvatarBytesFromDataUrl(custom), 4);

    assert.deepEqual(operatorAvatarPayload({ kind: "preset", presetId: "operator-20" }), { kind: "preset", presetId: "operator-20" });
    assert.deepEqual(operatorAvatarPayload({ dataUrl: custom, kind: "custom" }), { dataUrl: custom, kind: "custom" });
    assert.equal(operatorAvatarPayload({ kind: "preset", presetId: "operator-99" }), null);
    assert.equal(operatorAvatarPayload({ dataUrl: "data:text/html;base64,PHNjcmlwdD4=", kind: "custom" }), null);
  });

  it("preserves an operator avatar while joining workload and routing report data", () => {
    const rows = mergeReportOperatorRows(
      [{ agentTouches: 7, assignedBacklog: 2, avatar: "/avatars/operator-14.png", operatorId: "operator-qa", operatorName: "Арина" }],
      [{ operatorId: "operator-qa", transferEvents: 3 }]
    );

    assert.deepEqual(rows, [{
      avatar: "/avatars/operator-14.png",
      backlog: 2,
      firstResponse: null,
      id: "operator-qa",
      identityDescription: null,
      identityStatus: "canonical",
      label: "Арина",
      resolved: 0,
      touches: 7,
      transfers: 3
    }]);
  });
});
