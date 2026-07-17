import { type BackendEnvelope } from "@support-communication/envelope";
import { ReportRepository, type ScheduledDigestDescriptorRecord } from "./report.repository.js";
import { ReportService } from "./report.service.js";

const SCHEDULED_DIGEST_EXPORT_COLUMNS = ["metric", "today", "previous", "delta", "status"];

export interface ScheduledDigestClaimWorkerInput {
  limit?: number;
  now: Date;
  reportRepository: ReportRepository;
  tenantId?: string;
}

export interface ScheduledDigestClaimWorkerResult {
  claimed: ScheduledDigestDescriptorRecord[];
}

export interface ScheduledDigestExportJobWorkerInput {
  descriptor: ScheduledDigestDescriptorRecord;
  now?: Date;
  reportRepository: ReportRepository;
  reportService: ReportService;
}

export interface ScheduledDigestExportJobWorkerResult {
  descriptor: ScheduledDigestDescriptorRecord;
  exportEnvelope: BackendEnvelope<Record<string, unknown>>;
}

export function claimDueScheduledDigestDescriptors(input: ScheduledDigestClaimWorkerInput): ScheduledDigestClaimWorkerResult {
  if (input.limit !== undefined && (!Number.isInteger(input.limit) || input.limit < 0)) {
    throw new Error("scheduled_digest_claim_limit_invalid");
  }

  const dueDescriptors = input.reportRepository.listScheduledDigestDescriptors({
    dueBefore: input.now.toISOString(),
    status: "due",
    tenantId: input.tenantId
  });
  const limit = input.limit ?? dueDescriptors.length;
  const claimed = dueDescriptors.slice(0, limit).map((descriptor) =>
    input.reportRepository.saveScheduledDigestDescriptor({
      ...descriptor,
      status: "running",
      updatedAt: input.now.toISOString()
    })
  );

  return { claimed };
}

export async function claimDueScheduledDigestDescriptorsAsync(input: ScheduledDigestClaimWorkerInput): Promise<ScheduledDigestClaimWorkerResult> {
  if (input.limit !== undefined && (!Number.isInteger(input.limit) || input.limit < 0)) {
    throw new Error("scheduled_digest_claim_limit_invalid");
  }

  const dueDescriptors = await input.reportRepository.listScheduledDigestDescriptorsAsync({
    dueBefore: input.now.toISOString(),
    status: "due",
    tenantId: input.tenantId
  });
  const limit = input.limit ?? dueDescriptors.length;
  const claimed = await Promise.all(dueDescriptors.slice(0, limit).map((descriptor) =>
    input.reportRepository.saveScheduledDigestDescriptorAsync({
      ...descriptor,
      status: "running",
      updatedAt: input.now.toISOString()
    })
  ));

  return { claimed };
}

export async function queueScheduledDigestExportJob(input: ScheduledDigestExportJobWorkerInput): Promise<ScheduledDigestExportJobWorkerResult> {
  const descriptor = await input.reportRepository.saveScheduledDigestDescriptorAsync(input.descriptor);
  const exportWindow = scheduledDigestExportWindow(descriptor);
  const exportEnvelope = await input.reportService.requestReportExport({
    columns: SCHEDULED_DIGEST_EXPORT_COLUMNS,
    filters: {
      periodKey: descriptor.periodKey,
      scheduleId: descriptor.scheduleId,
      scheduledDigest: true,
      snapshotAt: exportWindow.snapshotAt,
      tenantId: descriptor.tenantId
    },
    idempotencyKey: scheduledDigestExportIdempotencyKey(descriptor),
    period: exportWindow.period,
    reportType: descriptor.reportType
  }, { tenantId: descriptor.tenantId });
  const persistedDescriptor = await input.reportRepository.saveScheduledDigestDescriptorAsync({
    ...descriptor,
    status: exportEnvelope.status === "ok" ? "completed" : "failed",
    updatedAt: (input.now ?? new Date()).toISOString()
  });
  if (exportEnvelope.status === "ok") {
    const exportJobId = reportExportJobIdFromEnvelope(exportEnvelope);
    await input.reportRepository.saveReportNotificationDescriptorAsync({
      createdAt: (input.now ?? new Date()).toISOString(),
      eventType: "export.ready",
      exportJobId,
      id: scheduledDigestNotificationDescriptorId(descriptor),
      idempotencyKey: scheduledDigestNotificationIdempotencyKey(descriptor),
      payload: {
        periodKey: descriptor.periodKey,
        reportType: descriptor.reportType,
        scheduleId: descriptor.scheduleId
      },
      status: "queued",
      tenantId: descriptor.tenantId
    });
  }

  return {
    descriptor: persistedDescriptor,
    exportEnvelope
  };
}

function scheduledDigestExportWindow(descriptor: ScheduledDigestDescriptorRecord): {
  period: "today" | "7days";
  snapshotAt: string;
} {
  if (descriptor.reportType === "daily_support_digest") {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(descriptor.periodKey);
    if (!match) {
      throw new Error("scheduled_digest_period_key_invalid");
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const start = new Date(Date.UTC(year, month - 1, day));
    if (start.getUTCFullYear() !== year || start.getUTCMonth() !== month - 1 || start.getUTCDate() !== day) {
      throw new Error("scheduled_digest_period_key_invalid");
    }
    return {
      period: "today",
      snapshotAt: new Date(start.getTime() + 24 * 60 * 60 * 1_000 - 1).toISOString()
    };
  }

  if (descriptor.reportType === "weekly_support_digest") {
    const match = /^(\d{4})-W(\d{2})$/.exec(descriptor.periodKey);
    if (!match) {
      throw new Error("scheduled_digest_period_key_invalid");
    }
    const year = Number(match[1]);
    const week = Number(match[2]);
    const januaryFourth = new Date(Date.UTC(year, 0, 4));
    const mondayOffset = (januaryFourth.getUTCDay() + 6) % 7;
    const weekStart = new Date(januaryFourth.getTime() - mondayOffset * 24 * 60 * 60 * 1_000 + (week - 1) * 7 * 24 * 60 * 60 * 1_000);
    const weekThursday = new Date(weekStart.getTime() + 3 * 24 * 60 * 60 * 1_000);
    if (week < 1 || week > 53 || weekThursday.getUTCFullYear() !== year) {
      throw new Error("scheduled_digest_period_key_invalid");
    }
    return {
      period: "7days",
      snapshotAt: new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1_000 - 1).toISOString()
    };
  }

  throw new Error("scheduled_digest_report_type_invalid");
}

function scheduledDigestExportIdempotencyKey(descriptor: ScheduledDigestDescriptorRecord): string {
  return `scheduled-digest-export:${descriptor.tenantId}:${descriptor.scheduleId}:${descriptor.periodKey}`;
}

function scheduledDigestNotificationDescriptorId(descriptor: ScheduledDigestDescriptorRecord): string {
  return `report-notification-${descriptor.tenantId}-${descriptor.scheduleId}-${descriptor.periodKey}`;
}

function scheduledDigestNotificationIdempotencyKey(descriptor: ScheduledDigestDescriptorRecord): string {
  return `scheduled-digest-notification:${descriptor.tenantId}:${descriptor.scheduleId}:${descriptor.periodKey}`;
}

function reportExportJobIdFromEnvelope(envelope: BackendEnvelope<Record<string, unknown>>): string {
  const job = envelope.data.job;
  if (!job || typeof job !== "object" || !("id" in job) || typeof (job as { id?: unknown }).id !== "string") {
    throw new Error("scheduled_digest_export_job_id_missing");
  }

  return (job as { id: string }).id;
}
