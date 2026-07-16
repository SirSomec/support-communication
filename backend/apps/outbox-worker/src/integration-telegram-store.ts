export interface TelegramBotTokenResolver {
  resolveBotToken(tenantId: string, channelConnectionId?: string): Promise<string | undefined> | string | undefined;
}

export interface PrismaTelegramConnectionTokenClient {
  telegramConnection?: {
    findUnique(input: { where: { channelConnectionId: string } }): Promise<PrismaTelegramConnectionTokenRow | null | undefined>;
    findFirst?(input: {
      orderBy?: Record<string, "asc" | "desc">;
      where: { status: string; tenantId: string };
    }): Promise<PrismaTelegramConnectionTokenRow | null | undefined>;
  };
}

export interface PrismaTelegramConnectionTokenRow {
  botToken?: string | null;
  status?: string | null;
  tenantId?: string | null;
}

export function createIntegrationTelegramTokenResolver(fallbackBotToken = ""): TelegramBotTokenResolver {
  const fallback = String(fallbackBotToken ?? "").trim();

  return {
    resolveBotToken(): string | undefined {
      return fallback || undefined;
    }
  };
}

export function createPrismaIntegrationTelegramTokenResolver(
  client: PrismaTelegramConnectionTokenClient | undefined,
  fallbackBotToken = ""
): TelegramBotTokenResolver {
  const fallback = String(fallbackBotToken ?? "").trim();

  return {
    async resolveBotToken(tenantId: string, channelConnectionId?: string): Promise<string | undefined> {
      const normalizedTenantId = String(tenantId ?? "").trim();
      const normalizedConnectionId = String(channelConnectionId ?? "").trim();
      if (!normalizedTenantId) {
        return fallback || undefined;
      }

      if (normalizedConnectionId) {
        const row = await client?.telegramConnection?.findUnique({
          where: { channelConnectionId: normalizedConnectionId }
        });
        const token = String(row?.botToken ?? "").trim();
        if (row?.tenantId === normalizedTenantId && row?.status === "active" && token) {
          return token;
        }

        return fallback || undefined;
      }

      // Bot runtime and operator reply descriptors carry no channelConnectionId;
      // mirror the JSON-store resolver and fall back to the tenant's active connection.
      const row = await client?.telegramConnection?.findFirst?.({
        orderBy: { updatedAt: "desc" },
        where: { status: "active", tenantId: normalizedTenantId }
      });
      const token = String(row?.botToken ?? "").trim();
      return token || fallback || undefined;
    }
  };
}

