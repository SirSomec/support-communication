const GIBIBYTE = 1024 ** 3;
export function createBillingFileUploadQuotaChecker(billingService) {
    return {
        async checkFileUpload(input) {
            const envelope = await billingService.checkQuota({
                mode: "inspect",
                requested: Math.max(0, input.requestedBytes) / GIBIBYTE,
                resource: input.resource,
                tenantId: input.tenantId
            });
            const data = envelope.data;
            const toBytes = (value) => {
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
//# sourceMappingURL=workspace-quota.js.map