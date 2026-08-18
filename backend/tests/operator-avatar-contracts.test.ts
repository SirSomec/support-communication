import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_CUSTOM_OPERATOR_AVATAR_BYTES,
  OPERATOR_AVATAR_PRESET_IDS,
  resolveOperatorAvatarUrl,
  validateOperatorAvatar,
  withDefaultOperatorAvatarMetadata
} from "../apps/api-gateway/src/identity/operator-avatar.ts";

describe("operator avatar contracts", () => {
  it("accepts only whitelisted presets and keeps other operator metadata", () => {
    const selected = validateOperatorAvatar({ kind: "preset", presetId: "operator-20" });
    assert.equal(selected.ok, true);
    if (!selected.ok) {
      throw new Error("Expected a valid preset avatar.");
    }
    assert.equal(resolveOperatorAvatarUrl(selected.avatar), "/avatars/operator-20.png");

    const rejected = validateOperatorAvatar({ kind: "preset", presetId: "operator-21" });
    assert.equal(rejected.ok, false);
    if (!rejected.ok) {
      assert.equal(rejected.code, "operator_avatar_invalid");
    }

    const metadata = withDefaultOperatorAvatarMetadata({ employeeSettings: { locale: "ru" } });
    assert.deepEqual(metadata.employeeSettings, { locale: "ru" });
    const descriptor = metadata.operatorAvatar as { kind?: string; presetId?: string };
    assert.equal(descriptor.kind, "preset");
    assert.equal(OPERATOR_AVATAR_PRESET_IDS.includes(descriptor.presetId as typeof OPERATOR_AVATAR_PRESET_IDS[number]), true);
  });

  it("normalizes accepted custom data URLs and rejects unsupported or oversized images", () => {
    const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const customDataUrl = `data:image/png;base64,${pngSignature.toString("base64")}`;
    const accepted = validateOperatorAvatar({ dataUrl: customDataUrl, kind: "custom" });
    assert.equal(accepted.ok, true);
    if (!accepted.ok) {
      throw new Error("Expected a valid custom avatar.");
    }
    assert.deepEqual(accepted.avatar, { dataUrl: customDataUrl, kind: "custom" });

    const unsupported = validateOperatorAvatar({
      dataUrl: "data:image/gif;base64,R0lGODlhAQABAAAAACw=",
      kind: "custom"
    });
    assert.equal(unsupported.ok, false);
    if (!unsupported.ok) {
      assert.equal(unsupported.code, "operator_avatar_invalid");
    }

    const oversizedBytes = Buffer.alloc(MAX_CUSTOM_OPERATOR_AVATAR_BYTES + 1);
    oversizedBytes[0] = 0xff;
    oversizedBytes[1] = 0xd8;
    oversizedBytes[2] = 0xff;
    const oversized = validateOperatorAvatar({
      dataUrl: `data:image/jpeg;base64,${oversizedBytes.toString("base64")}`,
      kind: "custom"
    });
    assert.equal(oversized.ok, false);
    if (!oversized.ok) {
      assert.equal(oversized.code, "operator_avatar_too_large");
    }
  });
});
