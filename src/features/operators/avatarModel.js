import { getStandardOperatorAvatar, getStandardOperatorAvatarBySrc } from "./avatarCatalog.js";

export const OPERATOR_AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const OPERATOR_AVATAR_UPLOAD_TYPES = Object.freeze(["image/jpeg", "image/png", "image/webp"]);

const CUSTOM_AVATAR_PATTERN = /^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=\s]+$/i;

export function operatorAvatarSelection(avatar) {
  const preset = getStandardOperatorAvatarBySrc(avatar);
  if (preset) {
    return { kind: "preset", presetId: preset.id };
  }

  if (isCustomOperatorAvatar(avatar)) {
    return { dataUrl: String(avatar).trim(), kind: "custom" };
  }

  return null;
}

export function operatorAvatarPayload(selection) {
  if (selection?.kind === "preset" && getStandardOperatorAvatar(selection.presetId)) {
    return { kind: "preset", presetId: selection.presetId };
  }

  if (selection?.kind === "custom" && isCustomOperatorAvatar(selection.dataUrl)) {
    return { dataUrl: String(selection.dataUrl).trim(), kind: "custom" };
  }

  return null;
}

export function isCustomOperatorAvatar(value) {
  return CUSTOM_AVATAR_PATTERN.test(String(value ?? "").trim());
}

export function operatorAvatarBytesFromDataUrl(value) {
  const raw = String(value ?? "").trim();
  const commaIndex = raw.indexOf(",");
  if (commaIndex < 0) return 0;
  const base64 = raw.slice(commaIndex + 1).replace(/\s/g, "");
  if (!base64) return 0;
  const padding = (base64.match(/=*$/)?.[0].length ?? 0);
  return Math.max(0, Math.floor(base64.length * 0.75) - padding);
}

export function formatAvatarBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return "0 Б";
  if (value < 1024) return `${Math.round(value)} Б`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} КБ`;
  return `${(value / (1024 * 1024)).toFixed(2)} МБ`;
}
