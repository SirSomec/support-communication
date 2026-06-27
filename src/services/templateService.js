import { initialTemplates } from "../data.js";
import { createEnvelope, makeAuditId } from "./mockBackend.js";

const SERVICE = "templateService";

export const templateService = {
  async fetchTemplates({ operatorId = "current" } = {}) {
    return createEnvelope({
      service: SERVICE,
      operation: "fetchTemplates",
      data: {
        operatorId,
        items: initialTemplates,
        source: "operator_template_library"
      },
      partial: true
    });
  },

  async saveTemplate(template) {
    return createEnvelope({
      service: SERVICE,
      operation: "saveTemplate",
      data: {
        ...template,
        id: template.id ?? `tpl-${Date.now().toString(36)}`,
        auditId: makeAuditId("template"),
        version: template.version ?? 1
      }
    });
  },

  getReadiness() {
    return {
      id: SERVICE,
      status: "ready",
      operations: ["fetchTemplates", "saveTemplate"],
      traceId: `trc_${SERVICE}_ready`,
      states: ["loading", "empty", "error"]
    };
  }
};
