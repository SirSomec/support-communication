import { existsSync, readFileSync } from "node:fs";

interface IntegrationStoreTelegramConnection {
  botToken?: string;
  status?: string;
  tenantId?: string;
}

interface IntegrationStoreState {
  telegramConnections?: IntegrationStoreTelegramConnection[];
}

export interface TelegramBotTokenResolver {
  resolveBotToken(tenantId: string): string | undefined;
}

export function createIntegrationTelegramTokenResolver(
  storeFilePath: string | undefined,
  fallbackBotToken = ""
): TelegramBotTokenResolver {
  const fallback = String(fallbackBotToken ?? "").trim();

  return {
    resolveBotToken(tenantId: string): string | undefined {
      const normalizedTenantId = String(tenantId ?? "").trim();
      if (!normalizedTenantId) {
        return fallback || undefined;
      }

      const fromStore = readTelegramBotTokenFromStore(storeFilePath, normalizedTenantId);
      if (fromStore) {
        return fromStore;
      }

      return fallback || undefined;
    }
  };
}

function readTelegramBotTokenFromStore(storeFilePath: string | undefined, tenantId: string): string | undefined {
  const filePath = String(storeFilePath ?? "").trim();
  if (!filePath || !existsSync(filePath)) {
    return undefined;
  }

  try {
    const state = JSON.parse(readFileSync(filePath, "utf8")) as IntegrationStoreState;
    const connection = (state.telegramConnections ?? []).find((item) =>
      item.tenantId === tenantId && item.status === "active"
    );
    const token = String(connection?.botToken ?? "").trim();
    return token || undefined;
  } catch {
    return undefined;
  }
}
