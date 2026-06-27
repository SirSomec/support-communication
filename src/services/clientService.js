import { conversations } from "../data.js";
import { createEnvelope, makeAuditId } from "./mockBackend.js";

const SERVICE = "clientService";

export const clientService = {
  async fetchClientProfiles(filters = {}) {
    return createEnvelope({
      service: SERVICE,
      operation: "fetchClientProfiles",
      data: {
        items: conversations,
        mergeGraph: buildMergeGraph(conversations),
        pagination: {
          mode: "backend-ready",
          page: filters.page ?? 1,
          pageSize: filters.pageSize ?? 25,
          total: conversations.length
        }
      },
      partial: true,
      meta: { filters }
    });
  },

  async mergeClientProfiles({ candidate, primary }) {
    return createEnvelope({
      service: SERVICE,
      operation: "mergeClientProfiles",
      data: {
        primaryProfileId: toSourceProfileId(primary),
        mergedProfileId: toSourceProfileId(candidate),
        mergeGraphEdge: `${primary.id}->${candidate.id}`,
        conflictResolution: detectConflict(primary, candidate),
        sourceProfileIds: [toSourceProfileId(primary), toSourceProfileId(candidate)],
        auditId: makeAuditId("client_merge")
      }
    });
  },

  async unmergeClientProfile({ candidate, primary }) {
    return createEnvelope({
      service: SERVICE,
      operation: "unmergeClientProfile",
      data: {
        primaryProfileId: toSourceProfileId(primary),
        detachedProfileId: toSourceProfileId(candidate),
        mergeGraphEdge: `${primary.id}->${candidate.id}`,
        conflictResolution: "manual_detach",
        auditId: makeAuditId("client_merge")
      }
    });
  },

  getReadiness() {
    return {
      id: SERVICE,
      status: "ready",
      operations: ["fetchClientProfiles", "mergeClientProfiles", "unmergeClientProfile"],
      traceId: `trc_${SERVICE}_ready`,
      states: ["loading", "empty", "error", "partial"],
      note: "Client profiles expose merge graph, conflicts, source ids and merge audit."
    };
  }
};

function buildMergeGraph(items) {
  return items.map((client) => ({
    profileId: toSourceProfileId(client),
    candidateIds: items
      .filter((candidate) => candidate.id !== client.id)
      .filter((candidate) => candidate.phone.slice(0, 6) === client.phone.slice(0, 6) || candidate.name.split(" ")[0] === client.name.split(" ")[0])
      .map(toSourceProfileId)
  }));
}

function toSourceProfileId(client) {
  return `src_${client.channel.toLowerCase()}_${client.id}`;
}

function detectConflict(primary, candidate) {
  const conflicts = [];

  if (primary.phone !== candidate.phone) {
    conflicts.push("phone");
  }

  if (primary.device !== candidate.device) {
    conflicts.push("device");
  }

  if (primary.entry !== candidate.entry) {
    conflicts.push("entry");
  }

  return conflicts.length ? `manual_review:${conflicts.join(",")}` : "auto_merge";
}
