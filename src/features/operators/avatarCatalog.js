export const STANDARD_OPERATOR_AVATARS = Object.freeze(
  Array.from({ length: 20 }, (_, index) => {
    const number = String(index + 1).padStart(2, "0");
    return Object.freeze({
      id: `operator-${number}`,
      label: `Стандартный аватар ${index + 1}`,
      src: `/avatars/operator-${number}.png`
    });
  })
);

const avatarById = new Map(STANDARD_OPERATOR_AVATARS.map((avatar) => [avatar.id, avatar]));
const avatarBySrc = new Map(STANDARD_OPERATOR_AVATARS.map((avatar) => [avatar.src, avatar]));

export function getStandardOperatorAvatar(avatarId) {
  return avatarById.get(String(avatarId ?? "").trim()) ?? null;
}

export function getStandardOperatorAvatarBySrc(src) {
  const normalized = normalizeAvatarPath(src);
  return avatarBySrc.get(normalized) ?? null;
}

export function isStandardOperatorAvatarId(avatarId) {
  return Boolean(getStandardOperatorAvatar(avatarId));
}

function normalizeAvatarPath(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  try {
    const origin = typeof window === "undefined" ? "http://local.frontend" : window.location.origin;
    return new URL(raw, origin).pathname;
  } catch {
    return raw;
  }
}
