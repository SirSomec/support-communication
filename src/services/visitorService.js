import { activeVisitors, proactiveRules, rescueChats } from "../data.js";
import { addMinutes, createEnvelope, makeAuditId } from "./mockBackend.js";

const SERVICE = "visitorService";

export const visitorService = {
  async fetchVisitorWorkspace() {
    return createEnvelope({
      service: SERVICE,
      operation: "fetchVisitorWorkspace",
      data: {
        activeVisitors,
        proactiveRules,
        rescueChats
      },
      partial: true
    });
  },

  async saveProactiveRule(rule) {
    return createEnvelope({
      service: SERVICE,
      operation: "saveProactiveRule",
      data: {
        rule,
        frequencyCap: {
          id: `cap_${rule.id}_${Date.now().toString(36)}`,
          cooldown: rule.cooldown ?? "24h",
          perUser: true,
          perChannel: true
        },
        experiment: {
          id: `exp_${rule.id}_${Date.now().toString(36)}`,
          activeVariant: rule.activeVariant ?? "A",
          persisted: true
        },
        targeting: {
          channels: rule.channels ?? [],
          segment: rule.segment ?? "manual",
          privacyChecked: true
        },
        auditId: makeAuditId("proactive")
      }
    });
  },

  async triggerRescueReturn(chat) {
    const serverDeadlineAt = addMinutes(new Date(), 3).toISOString();

    return createEnvelope({
      service: SERVICE,
      operation: "triggerRescueReturn",
      data: {
        chatId: chat.id,
        channel: chat.channel,
        countdown: {
          serverDeadlineAt,
          autoReturn: true,
          policy: "channel_queue_role"
        },
        outcome: {
          status: "return_queued",
          analyticsKey: `rescue_${chat.channel}_${Date.now().toString(36)}`
        },
        auditId: makeAuditId("rescue")
      }
    });
  },

  getReadiness() {
    return {
      id: SERVICE,
      status: "ready",
      operations: ["fetchVisitorWorkspace", "saveProactiveRule", "triggerRescueReturn"],
      traceId: `trc_${SERVICE}_ready`,
      states: ["loading", "empty", "error", "partial"],
      note: "Proactive and rescue actions expose server countdown, caps and experiment ids."
    };
  }
};
