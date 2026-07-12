import { createPrismaClient } from "@support-communication/database";

export interface ProviderMessageBindingRecord {
  id: string;
  channelConnectionId: string;
  conversationId: string;
  internalMessageId: string;
  provider: string;
  providerConversationId: string;
  providerMessageId: string;
  status: string;
  tenantId: string;
}

interface ProviderMessageBindingClient {
  providerMessageBinding: {
    findUnique(input: { where: { tenantId_channelConnectionId_providerMessageId: { channelConnectionId: string; providerMessageId: string; tenantId: string } } }): Promise<ProviderMessageBindingRecord | null>;
    update(input: { data: { status: string; updatedAt: Date }; where: { id: string } }): Promise<ProviderMessageBindingRecord & { id: string }>;
  };
}

export class ProviderMessageBindingRepository {
  private static instance: ProviderMessageBindingRepository | null = null;

  constructor(private readonly client: ProviderMessageBindingClient = createPrismaClient({ datasourceUrl: process.env.DATABASE_URL }) as ProviderMessageBindingClient) {}

  static default(): ProviderMessageBindingRepository {
    return this.instance ??= new ProviderMessageBindingRepository();
  }

  async find(tenantId: string, channelConnectionId: string, providerMessageId: string): Promise<ProviderMessageBindingRecord | null> {
    return this.client.providerMessageBinding.findUnique({
      where: { tenantId_channelConnectionId_providerMessageId: { tenantId, channelConnectionId, providerMessageId } }
    });
  }

  async advance(binding: ProviderMessageBindingRecord, status: string): Promise<ProviderMessageBindingRecord> {
    const next = normalizedStatus(status);
    const current = normalizedStatus(binding.status);
    if (!canAdvance(current, next)) return binding;
    return this.client.providerMessageBinding.update({ data: { status: next, updatedAt: new Date() }, where: { id: binding.id } });
  }
}

function normalizedStatus(status: string): string {
  const value = String(status ?? "").trim().toLowerCase();
  return ["sent", "delivered", "read", "failed"].includes(value) ? value : "sent";
}

function canAdvance(current: string, next: string): boolean {
  if (current === "sent") return next !== "sent";
  if (current === "delivered") return next === "read";
  return false;
}
