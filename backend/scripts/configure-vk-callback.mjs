import { createPrismaClient } from "../packages/database/dist/index.js";
import { randomBytes } from "node:crypto";
import { ProviderConnectionCrypto } from "../apps/api-gateway/dist/integrations/provider-connection-crypto.js";

const connectionId = required(process.env.VK_CALLBACK_CONNECTION_ID, "vk_callback_connection_id_required");
const client = createPrismaClient({ datasourceUrl: required(process.env.DATABASE_URL, "database_url_required") });

try {
  const credential = await client.providerConnectionCredential.findUnique({ where: { channelConnectionId: connectionId } });
  if (!credential || credential.provider !== "vk" || credential.status !== "active") {
    throw new Error("vk_callback_connection_not_found");
  }
  const connection = await client.channelConnection.findUnique({
    where: { tenantId_id: { id: connectionId, tenantId: credential.tenantId } }
  });
  if (!connection || connection.type !== "vk" || connection.status !== "active") {
    throw new Error("vk_callback_channel_not_active");
  }

  const crypto = ProviderConnectionCrypto.fromEnvironment(credential.keyVersion);
  const accessToken = crypto.decrypt(JSON.parse(credential.accessTokenEncrypted));
  const storedSecret = crypto.decrypt(JSON.parse(credential.webhookSecretEncrypted));
  // Connections created before the VK-specific validation used UUIDs, which
  // VK rejects because of hyphens. Rotate only those invalid legacy values.
  const secret = /^[A-Za-z0-9]{1,24}$/.test(storedSecret) ? storedSecret : randomBytes(12).toString("hex");
  const groupId = required(credential.externalAccountId, "vk_group_id_required");
  const apiVersion = credential.apiVersion || "5.199";

  const servers = await vk("groups.getCallbackServers", { group_id: groupId }, accessToken, apiVersion);
  let current = Array.isArray(servers.items)
    ? servers.items.find((item) => String(item?.url ?? "") === connection.webhookUrl)
    : undefined;
  if (process.env.VK_CALLBACK_INSPECT === "true") {
    const serverId = Number(current?.id ?? 0);
    const settings = serverId > 0
      ? await vk("groups.getCallbackSettings", { group_id: groupId, server_id: String(serverId) }, accessToken, apiVersion)
      : null;
    const callbackServers = Array.isArray(servers.items)
      ? servers.items.map((item) => ({
          id: item?.id ?? null,
          status: item?.status ?? null,
          title: item?.title ?? null,
          url: item?.url ?? null
        }))
      : [];
    process.stdout.write(`${JSON.stringify({
      connectionId,
      groupId,
      expectedWebhookUrl: connection.webhookUrl,
      callbackServers,
      callbackSettings: settings
    })}\n`);
    process.exitCode = serverId > 0 ? 0 : 2;
  } else {
    const confirmation = await vk("groups.getCallbackConfirmationCode", { group_id: groupId }, accessToken, apiVersion);
    const confirmationCode = required(String(confirmation.code ?? confirmation), "vk_confirmation_code_unavailable");

    if (String(current?.status ?? "").toLowerCase() === "failed") {
      await vk("groups.deleteCallbackServer", { group_id: groupId, server_id: String(current.id) }, accessToken, apiVersion);
      current = undefined;
    }

    // Adding a Callback API server immediately makes VK send the confirmation
    // request. Store the answer first, otherwise VK marks the server failed.
    await client.providerConnectionCredential.update({
      data: {
        confirmationCodeEncrypted: JSON.stringify(crypto.encrypt(confirmationCode)),
        lastError: null,
        updatedAt: new Date(),
        webhookSecretEncrypted: JSON.stringify(crypto.encrypt(secret))
      },
      where: { channelConnectionId: connectionId }
    });

    const serverId = current?.id ?? await addServer({ accessToken, apiVersion, groupId, secret, url: connection.webhookUrl });

    await vk("groups.setCallbackSettings", {
      api_version: apiVersion,
      group_id: groupId,
      message_new: "1",
      server_id: String(serverId)
    }, accessToken, apiVersion);

    process.stdout.write(`${JSON.stringify({ connectionId, configured: true, serverId, webhookUrl: connection.webhookUrl })}\n`);
  }
} finally {
  await client.$disconnect();
}

async function addServer({ accessToken, apiVersion, groupId, secret, url }) {
  const response = await vk("groups.addCallbackServer", {
    group_id: groupId,
    secret_key: secret,
    // VK limits a Callback API server title to 14 characters.
    title: "SupportComm",
    url
  }, accessToken, apiVersion);
  const serverId = Number(response.server_id ?? response);
  if (!Number.isInteger(serverId) || serverId <= 0) throw new Error("vk_callback_server_id_invalid");
  return serverId;
}

async function vk(method, parameters, accessToken, apiVersion) {
  const body = new URLSearchParams({ ...parameters, access_token: accessToken, v: apiVersion });
  const response = await fetch(`https://api.vk.com/method/${method}`, {
    body,
    headers: { "content-type": "application/x-www-form-urlencoded" },
    method: "POST",
    signal: AbortSignal.timeout(15_000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) {
    const code = String(payload.error?.error_code ?? response.status);
    const message = String(payload.error?.error_msg ?? "unknown").replace(/\s+/g, " ").slice(0, 160);
    throw new Error(`vk_${method}_failed:${code}:${message}`);
  }
  return payload.response;
}

function required(value, code) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(code);
  return normalized;
}
