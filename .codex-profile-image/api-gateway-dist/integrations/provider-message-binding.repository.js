import { createPrismaClient } from "@support-communication/database";
export class ProviderMessageBindingRepository {
    client;
    static instance = null;
    constructor(client = createPrismaClient({ datasourceUrl: process.env.DATABASE_URL })) {
        this.client = client;
    }
    static default() {
        return this.instance ??= new ProviderMessageBindingRepository();
    }
    async find(tenantId, channelConnectionId, providerMessageId) {
        return this.client.providerMessageBinding.findUnique({
            where: { tenantId_channelConnectionId_providerMessageId: { tenantId, channelConnectionId, providerMessageId } }
        });
    }
    async advance(binding, status) {
        const next = normalizedStatus(status);
        const current = normalizedStatus(binding.status);
        if (!canAdvance(current, next))
            return binding;
        return this.client.providerMessageBinding.update({ data: { status: next, updatedAt: new Date() }, where: { id: binding.id } });
    }
}
function normalizedStatus(status) {
    const value = String(status ?? "").trim().toLowerCase();
    return ["sent", "delivered", "read", "failed"].includes(value) ? value : "sent";
}
function canAdvance(current, next) {
    if (current === "sent")
        return next !== "sent";
    if (current === "delivered")
        return next === "read";
    return false;
}
//# sourceMappingURL=provider-message-binding.repository.js.map