import { createHash, randomInt } from "node:crypto";

export const OPERATOR_AVATAR_METADATA_KEY = "operatorAvatar";
export const MAX_CUSTOM_OPERATOR_AVATAR_BYTES = 2 * 1024 * 1024;

export const OPERATOR_AVATAR_PRESET_IDS = [
  "operator-01",
  "operator-02",
  "operator-03",
  "operator-04",
  "operator-05",
  "operator-06",
  "operator-07",
  "operator-08",
  "operator-09",
  "operator-10",
  "operator-11",
  "operator-12",
  "operator-13",
  "operator-14",
  "operator-15",
  "operator-16",
  "operator-17",
  "operator-18",
  "operator-19",
  "operator-20"
] as const;

export type OperatorAvatarPresetId = typeof OPERATOR_AVATAR_PRESET_IDS[number];

export interface PresetOperatorAvatar {
  kind: "preset";
  presetId: OperatorAvatarPresetId;
}

export interface CustomOperatorAvatar {
  dataUrl: string;
  kind: "custom";
}

export type OperatorAvatarDescriptor = CustomOperatorAvatar | PresetOperatorAvatar;

export type OperatorAvatarValidationResult =
  | { avatar: OperatorAvatarDescriptor; ok: true }
  | {
      code: "operator_avatar_invalid" | "operator_avatar_too_large";
      message: string;
      ok: false;
    };

const DATA_URL_PATTERN = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/i;
const MAX_BASE64_LENGTH = Math.ceil(MAX_CUSTOM_OPERATOR_AVATAR_BYTES / 3) * 4 + 4;

/**
 * Returns a cryptographically random, whitelisted preset. The descriptor is
 * persisted with the user, so it remains stable after it has been assigned.
 */
export function createDefaultOperatorAvatar(): PresetOperatorAvatar {
  return {
    kind: "preset",
    presetId: OPERATOR_AVATAR_PRESET_IDS[randomInt(OPERATOR_AVATAR_PRESET_IDS.length)]
  };
}

/** A stable fallback used only when a historical session no longer has a user row. */
export function createFallbackOperatorAvatar(userId: string): PresetOperatorAvatar {
  const index = createHash("sha256").update(userId).digest().readUInt32BE(0) % OPERATOR_AVATAR_PRESET_IDS.length;
  return {
    kind: "preset",
    presetId: OPERATOR_AVATAR_PRESET_IDS[index]
  };
}

export function isOperatorAvatarPresetId(value: unknown): value is OperatorAvatarPresetId {
  return typeof value === "string" && (OPERATOR_AVATAR_PRESET_IDS as readonly string[]).includes(value);
}

/**
 * Validates input accepted by the public profile endpoint. Custom images are
 * canonicalized so the exact persisted payload is bounded and predictable.
 */
export function validateOperatorAvatar(value: unknown): OperatorAvatarValidationResult {
  if (!isRecord(value) || typeof value.kind !== "string") {
    return invalidAvatar("Avatar must be a preset or a supported image data URL.");
  }

  if (value.kind === "preset") {
    if (!isOperatorAvatarPresetId(value.presetId)) {
      return invalidAvatar("The selected avatar preset is not available.");
    }
    return {
      avatar: { kind: "preset", presetId: value.presetId },
      ok: true
    };
  }

  if (value.kind !== "custom" || typeof value.dataUrl !== "string") {
    return invalidAvatar("Avatar must be a preset or a supported image data URL.");
  }

  const match = DATA_URL_PATTERN.exec(value.dataUrl);
  if (!match) {
    return invalidAvatar("Custom avatar must be a JPEG, PNG, or WebP base64 data URL.");
  }

  const mimeType = match[1].toLowerCase();
  const encoded = match[2];
  if (encoded.length > MAX_BASE64_LENGTH) {
    return avatarTooLarge();
  }

  const decoded = decodeCanonicalBase64(encoded);
  if (!decoded) {
    return invalidAvatar("Custom avatar data is not valid base64.");
  }
  if (decoded.byteLength > MAX_CUSTOM_OPERATOR_AVATAR_BYTES) {
    return avatarTooLarge();
  }
  if (!matchesImageSignature(mimeType, decoded)) {
    return invalidAvatar("Custom avatar content does not match its declared image type.");
  }

  return {
    avatar: {
      dataUrl: `data:${mimeType};base64,${decoded.toString("base64")}`,
      kind: "custom"
    },
    ok: true
  };
}

export function operatorAvatarFromMetadata(metadata: unknown): OperatorAvatarDescriptor | null {
  if (!isRecord(metadata)) {
    return null;
  }

  const result = validateOperatorAvatar(metadata[OPERATOR_AVATAR_METADATA_KEY]);
  return result.ok ? result.avatar : null;
}

/**
 * Preserves all existing metadata while assigning (or repairing) the avatar
 * descriptor. This is intentionally used at the repository write boundary so
 * all employee/provision/onboarding creation paths receive a default avatar.
 */
export function withDefaultOperatorAvatarMetadata(metadata: unknown): Record<string, unknown> {
  const current = isRecord(metadata) ? { ...metadata } : {};
  const avatar = operatorAvatarFromMetadata(current) ?? createDefaultOperatorAvatar();
  return {
    ...current,
    [OPERATOR_AVATAR_METADATA_KEY]: avatar
  };
}

export function withOperatorAvatarMetadata(
  metadata: unknown,
  avatar: OperatorAvatarDescriptor
): Record<string, unknown> {
  return {
    ...(isRecord(metadata) ? metadata : {}),
    [OPERATOR_AVATAR_METADATA_KEY]: avatar
  };
}

export function resolveOperatorAvatarUrl(avatar: OperatorAvatarDescriptor): string {
  return avatar.kind === "preset" ? `/avatars/${avatar.presetId}.png` : avatar.dataUrl;
}

function decodeCanonicalBase64(encoded: string): Buffer | null {
  // Base64 padding can only occur at the end and a single dangling sextet is
  // invalid. Avoid decoding arbitrarily malformed user-controlled strings.
  if (encoded.length % 4 === 1) {
    return null;
  }

  const decoded = Buffer.from(encoded, "base64");
  if (decoded.length === 0) {
    return null;
  }

  const sourceWithoutPadding = encoded.replace(/=+$/, "");
  const decodedWithoutPadding = decoded.toString("base64").replace(/=+$/, "");
  return sourceWithoutPadding === decodedWithoutPadding ? decoded : null;
}

function matchesImageSignature(mimeType: string, bytes: Buffer): boolean {
  if (mimeType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === "image/png") {
    return bytes.length >= 8
      && bytes[0] === 0x89
      && bytes[1] === 0x50
      && bytes[2] === 0x4e
      && bytes[3] === 0x47
      && bytes[4] === 0x0d
      && bytes[5] === 0x0a
      && bytes[6] === 0x1a
      && bytes[7] === 0x0a;
  }
  return bytes.length >= 12
    && bytes.subarray(0, 4).toString("ascii") === "RIFF"
    && bytes.subarray(8, 12).toString("ascii") === "WEBP";
}

function invalidAvatar(message: string): OperatorAvatarValidationResult {
  return { code: "operator_avatar_invalid", message, ok: false };
}

function avatarTooLarge(): OperatorAvatarValidationResult {
  return {
    code: "operator_avatar_too_large",
    message: "Custom avatar must not exceed 2 MiB after decoding.",
    ok: false
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
