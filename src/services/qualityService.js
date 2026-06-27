import { aiSuggestions, knowledgeArticles, qualityScores } from "../data.js";
import { getPreSendQualityChecks } from "../app/aiQualityModel.js";
import { createEnvelope, makeAuditId } from "./mockBackend.js";

const SERVICE = "qualityService";

export const qualityService = {
  async fetchQualityWorkspace() {
    return createEnvelope({
      service: SERVICE,
      operation: "fetchQualityWorkspace",
      data: {
        aiSuggestions,
        knowledgeArticles,
        qualityMetrics: qualityScores
      },
      partial: true
    });
  },

  async scoreDraftResponse({ attachments = [], conversationId, mode = "reply", suggestions = [], text }) {
    const checks = getPreSendQualityChecks({ draft: text ?? "", mode, attachments, suggestions });
    const dangerCount = checks.filter((check) => check.tone === "danger").length;
    const warnCount = checks.filter((check) => check.tone === "warn").length;
    const score = Math.max(0, 100 - dangerCount * 35 - warnCount * 15);

    return createEnvelope({
      service: SERVICE,
      operation: "scoreDraftResponse",
      data: {
        conversationId,
        score,
        checks,
        repairActions: checks
          .filter((check) => check.tone !== "ok")
          .map((check) => ({ id: `repair-${check.id}`, label: check.label, severity: check.tone })),
        telemetry: {
          model: "quality-mock/v1",
          auditId: makeAuditId("ai"),
          effectivenessKey: `quality_${conversationId ?? "draft"}`
        }
      }
    });
  },

  getReadiness() {
    return {
      id: SERVICE,
      status: "ready",
      operations: ["fetchQualityWorkspace", "scoreDraftResponse"],
      traceId: `trc_${SERVICE}_ready`,
      states: ["loading", "empty", "error", "partial"],
      note: "Quality scoring exposes telemetry and repair actions for future scoring service."
    };
  }
};
