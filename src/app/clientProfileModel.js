const APPEAL_ANCHOR_TAG_PREFIX = "appeal-anchor:";

export function normalizeClientPhone(phone) {
  return String(phone ?? "").replace(/\D/g, "").trim();
}

export function extractAppealAnchorId(conversation) {
  const metadataAnchor = conversation?.metadata?.anchorId;
  if (typeof metadataAnchor === "string" && metadataAnchor.trim()) {
    return metadataAnchor.trim();
  }

  const tags = Array.isArray(conversation?.tags) ? conversation.tags : [];
  const anchorTag = tags.find((tag) => String(tag).startsWith(APPEAL_ANCHOR_TAG_PREFIX));
  if (anchorTag) {
    return String(anchorTag).slice(APPEAL_ANCHOR_TAG_PREFIX.length).trim();
  }

  return "";
}

export function resolveClientIdentityKey(conversation) {
  const channel = String(conversation?.channel ?? "unknown").trim().toLowerCase() || "unknown";
  const phone = normalizeClientPhone(conversation?.phone);
  if (phone) {
    return `phone:${channel}:${phone}`;
  }

  const anchorId = extractAppealAnchorId(conversation);
  if (anchorId) {
    return `anchor:${anchorId}`;
  }

  return `conversation:${String(conversation?.id ?? "unknown").trim()}`;
}

// Клиент один и тот же во всех каналах: единый диалог клиента собирается
// по телефону без учета канала, в отличие от resolveClientIdentityKey.
export function resolveClientThreadKey(conversation) {
  const phone = normalizeClientPhone(conversation?.phone);
  if (phone) {
    return `phone:${phone}`;
  }

  const anchorId = extractAppealAnchorId(conversation);
  if (anchorId) {
    return `anchor:${anchorId}`;
  }

  return `conversation:${String(conversation?.id ?? "unknown").trim()}`;
}

export function buildSourceProfileId(conversation) {
  const channel = String(conversation?.channel ?? "").trim().toLowerCase();
  const phone = normalizeClientPhone(conversation?.phone);
  if (phone && channel) {
    return `src_${channel}_${phone}`;
  }

  const anchorId = extractAppealAnchorId(conversation);
  if (anchorId && channel) {
    return `src_${channel}_${anchorId}`;
  }

  return "";
}

export function groupConversationsIntoClientProfiles(conversations) {
  const items = Array.isArray(conversations) ? conversations : [];
  const groups = new Map();

  for (const conversation of items) {
    const key = resolveClientIdentityKey(conversation);
    const bucket = groups.get(key) ?? [];
    bucket.push(conversation);
    groups.set(key, bucket);
  }

  return [...groups.entries()].map(([clientIdentityKey, groupedConversations]) => {
    const primary = pickPrimaryConversation(groupedConversations);
    return {
      ...primary,
      appealCount: groupedConversations.length,
      clientIdentityKey,
      conversationIds: groupedConversations.map((conversation) => conversation.id),
      linkedConversations: groupedConversations,
      previous: mergePreviousHistory(groupedConversations),
      sourceProfileId: buildSourceProfileId(primary),
      tags: mergeTags(groupedConversations)
    };
  });
}

function pickPrimaryConversation(conversations) {
  return [...conversations].sort((left, right) => conversationActivityScore(right) - conversationActivityScore(left))[0];
}

function conversationActivityScore(conversation) {
  const status = String(conversation?.status ?? "").toLowerCase();
  const statusScore = status === "closed" ? 0 : 1;
  const updatedAt = Date.parse(String(conversation?.updatedAt ?? conversation?.metadata?.closedAt ?? ""));
  const timeScore = Number.isFinite(updatedAt) ? updatedAt : 0;
  return statusScore * 1e15 + timeScore;
}

function mergePreviousHistory(conversations) {
  const seen = new Set();
  const merged = [];

  for (const conversation of conversations) {
    for (const row of conversation.previous ?? []) {
      if (!Array.isArray(row)) {
        continue;
      }

      const key = row.join("|");
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      merged.push(row);
    }
  }

  return merged;
}

function mergeTags(conversations) {
  const tags = new Set();
  for (const conversation of conversations) {
    for (const tag of conversation.tags ?? []) {
      tags.add(tag);
    }
  }
  return [...tags];
}
