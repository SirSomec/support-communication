import { IntegrationRepository } from "../integrations/integration.repository.js";
import { IntegrationService } from "../integrations/integration.service.js";
import { ReportRepository } from "../reports/report.repository.js";
import { ReportService } from "../reports/report.service.js";
import type {
  DeadLetterReplayBackendItem,
  DeadLetterReplayBackendStore
} from "./dead-letter-replay.worker.js";

interface ReplayEnvelope {
  data: Record<string, any>;
  error?: { code?: string } | null;
  status: string;
}

interface ReportReplayBackendOptions {
  findExportJob?: (id: string) => Promise<Record<string, any> | undefined>;
  retryExport?: (id: string, tenantId: string, reason: string) => Promise<ReplayEnvelope>;
}

interface WebhookReplayBackendOptions {
  findDelivery?: (id: string) => Promise<Record<string, any> | undefined>;
  replayDelivery?: (id: string, idempotencyKey: string) => Promise<ReplayEnvelope>;
}

export function createReportExportDeadLetterReplayBackendStore(
  options: ReportReplayBackendOptions = {}
): DeadLetterReplayBackendStore<DeadLetterReplayBackendItem> {
  const findExportJob = options.findExportJob ?? (async (id) => {
    return (await ReportRepository.default().listExportJobsAsync()).find((job) => job.id === id);
  });
  const retryExport = options.retryExport ?? (async (id, tenantId, reason) => {
    return new ReportService(ReportRepository.default()).retryReportExport({ jobId: id, reason }, { tenantId });
  });

  return {
    async replayDeadLettered(id, queue, reason) {
      const job = await findExportJob(id);
      const tenantId = String(job?.tenantId ?? "").trim();
      if (!job || !tenantId) {
        throw new Error("report_export_dead_letter_not_found");
      }
      if (!["error", "expired"].includes(String(job.statusKey ?? ""))) {
        throw new Error("report_export_dead_letter_not_replayable");
      }

      const result = await retryExport(id, tenantId, reason);
      if (result.status !== "ok") {
        throw new Error(result.error?.code ?? "report_export_dead_letter_replay_failed");
      }
      const replayed = result.data.job ?? {};
      return {
        attempts: Number(replayed.attempts ?? 0),
        deadLetteredAt: null,
        id,
        lastError: null,
        queue,
        status: String(replayed.statusKey ?? "queued")
      };
    }
  };
}

export function createWebhookDeliveryDeadLetterReplayBackendStore(
  options: WebhookReplayBackendOptions = {}
): DeadLetterReplayBackendStore<DeadLetterReplayBackendItem> {
  const findDelivery = options.findDelivery ?? (async (id) => {
    return await IntegrationRepository.default().findWebhookDeliveryJournalEntryAsync(id);
  });
  const replayDelivery = options.replayDelivery ?? (async (id, idempotencyKey) => {
    return new IntegrationService(IntegrationRepository.default()).replayWebhookDelivery({
      deliveryId: id,
      idempotencyKey
    });
  });

  return {
    async replayDeadLettered(id, queue, _reason, replayedAt = new Date(), auditEvent) {
      const delivery = await findDelivery(id);
      if (!delivery) {
        throw new Error("webhook_delivery_dead_letter_not_found");
      }
      if (String(delivery.status ?? "") !== "dead_lettered") {
        throw new Error("webhook_delivery_dead_letter_not_replayable");
      }

      const idempotencyKey = auditEvent?.id ?? `operations-webhook-replay:${id}:${replayedAt.getTime()}`;
      const result = await replayDelivery(id, idempotencyKey);
      if (result.status !== "ok") {
        throw new Error(result.error?.code ?? "webhook_delivery_dead_letter_replay_failed");
      }
      return {
        attempts: Number(delivery.attempts ?? 0),
        deadLetteredAt: null,
        id,
        lastError: null,
        queue,
        status: String(result.data.status ?? "replay_queued")
      };
    }
  };
}
