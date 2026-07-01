import { apiRequest } from "./apiClient.js";

const SERVICE = "clientService";
const DEFAULT_MERGE_REASON = "Duplicate profile merge requested from client workspace";
const DEFAULT_UNMERGE_REASON = "Profile unmerge requested from client workspace";

export const clientService = {
  async fetchClientProfiles(filters = {}) {
    return apiRequest("/clients", {
      operation: "fetchClientProfiles",
      query: filters,
      service: SERVICE
    });
  },

  async mergeClientProfiles(payload = {}) {
    return apiRequest("/clients/merge", {
      body: normalizeMergePayload(payload),
      method: "POST",
      operation: "mergeClientProfiles",
      service: SERVICE
    });
  },

  async unmergeClientProfile(payload = {}) {
    return apiRequest("/clients/unmerge", {
      body: normalizeUnmergePayload(payload),
      method: "POST",
      operation: "unmergeClientProfile",
      service: SERVICE
    });
  },

  getReadiness() {
    return {
      id: SERVICE,
      status: "ready",
      operations: ["fetchClientProfiles", "mergeClientProfiles", "unmergeClientProfile"],
      traceId: `trc_${SERVICE}_ready`,
      states: ["loading", "empty", "error", "partial"],
      note: "Connected to API Gateway routes."
    };
  }
};

function normalizeMergePayload({ candidate, candidateProfileId, primary, primaryProfileId, reason } = {}) {
  return {
    candidateProfileId: candidateProfileId ?? toSourceProfileId(candidate),
    primaryProfileId: primaryProfileId ?? toSourceProfileId(primary),
    reason: normalizeReason(reason, DEFAULT_MERGE_REASON)
  };
}

function normalizeUnmergePayload({ candidate, candidateProfileId, detachedProfileId, primary, primaryProfileId, reason } = {}) {
  return {
    detachedProfileId: detachedProfileId ?? candidateProfileId ?? toSourceProfileId(candidate),
    primaryProfileId: primaryProfileId ?? toSourceProfileId(primary),
    reason: normalizeReason(reason, DEFAULT_UNMERGE_REASON)
  };
}

function normalizeReason(reason, fallback) {
  return String(reason ?? "").trim() || fallback;
}

function toSourceProfileId(profile) {
  if (!profile || typeof profile !== "object") {
    return profile;
  }

  if (profile.sourceProfileId) {
    return profile.sourceProfileId;
  }

  if (profile.channel && profile.id) {
    return `src_${String(profile.channel).toLowerCase()}_${profile.id}`;
  }

  return profile.id;
}
