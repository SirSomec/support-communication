import type { BillingService } from "../billing/billing.service.js";
import type { FileUploadQuotaChecker } from "./workspace.service.js";

const GIBIBYTE = 1024 ** 3;

export function createBillingFileUploadQuotaChecker(
  billingService: Pick<BillingService, "checkQuota">
): FileUploadQuotaChecker {
  return {
    async checkFileUpload(input) {
      const envelope = await billingService.checkQuota({
        mode: "inspect",
        requested: Math.max(0, input.requestedBytes) / GIBIBYTE,
        resource: input.resource,
        tenantId: input.tenantId
      });
      const data = envelope.data as Record<string, unknown>;
      const toBytes = (value: unknown): number | undefined => {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? Math.round(numeric * GIBIBYTE) : undefined;
      };
      return {
        allowed: envelope.status === "ok" && data.decision === "allow",
        limitBytes: toBytes(data.limit),
        remainingBytes: toBytes(data.remaining),
        usedBytes: toBytes(data.used)
      };
    }
  };
}
