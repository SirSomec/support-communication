export interface VkHttpResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export type VkHttpFetch = (input: string, init: {
  body?: string;
  headers?: Record<string, string>;
  method?: string;
  signal?: AbortSignal;
}) => Promise<VkHttpResponse>;

export interface VkCallbackPreparationInput {
  accessToken: string;
  apiVersion?: string;
  fetcher?: VkHttpFetch;
  groupId: string;
}

export interface VkCallbackSubscriptionInput extends VkCallbackPreparationInput {
  secret: string;
  serverTitle?: string;
  webhookUrl: string;
}

const DEFAULT_API_VERSION = "5.199";

/** Fetches the confirmation value before a server is created. VK sends its
 * confirmation request as part of server creation, so the app must already
 * have persisted this value when that happens. */
export async function prepareVkCallback(input: VkCallbackPreparationInput): Promise<{ confirmationCode: string }> {
  const response = await callVk("groups.getCallbackConfirmationCode", {}, input);
  const confirmationCode = String(response.code ?? response).trim();
  if (!confirmationCode) throw new Error("vk_confirmation_code_unavailable");
  return { confirmationCode };
}

/** Creates a VK Callback API server and enables new community messages. */
export async function subscribeVkCallback(input: VkCallbackSubscriptionInput): Promise<{ serverId: number }> {
  const secret = String(input.secret ?? "").trim();
  if (!/^[A-Za-z0-9]{1,24}$/.test(secret)) throw new Error("vk_callback_secret_invalid");
  const webhookUrl = validateWebhookUrl(input.webhookUrl);
  const created = await callVk("groups.addCallbackServer", {
    secret_key: secret,
    title: String(input.serverTitle ?? "SupportComm").trim().slice(0, 14) || "SupportComm",
    url: webhookUrl
  }, input);
  const serverId = Number(created.server_id ?? created);
  if (!Number.isInteger(serverId) || serverId <= 0) throw new Error("vk_callback_server_id_invalid");
  await callVk("groups.setCallbackSettings", {
    api_version: apiVersion(input),
    message_event: "1",
    message_new: "1",
    server_id: String(serverId)
  }, input);
  return { serverId };
}

async function callVk(method: string, parameters: Record<string, string>, input: VkCallbackPreparationInput): Promise<Record<string, unknown>> {
  const groupId = String(input.groupId ?? "").trim();
  const token = String(input.accessToken ?? "").trim();
  if (!groupId) throw new Error("vk_group_id_required");
  if (!token) throw new Error("vk_access_token_required");
  const body = new URLSearchParams({ ...parameters, access_token: token, group_id: groupId, v: apiVersion(input) });
  const response = await (input.fetcher ?? nativeFetch)(`https://api.vk.com/method/${method}`, {
    body: body.toString(),
    headers: { "content-type": "application/x-www-form-urlencoded" },
    method: "POST",
    signal: AbortSignal.timeout(15_000)
  });
  const raw = await response.text();
  let payload: { response?: Record<string, unknown>; error?: { error_code?: unknown; error_msg?: unknown } } = {};
  try { payload = JSON.parse(raw) as typeof payload; } catch { /* handled below */ }
  if (!response.ok || payload.error) {
    const code = String(payload.error?.error_code ?? response.status);
    throw new Error(`vk_${method}_failed:${code}:${safeError(String(payload.error?.error_msg ?? raw))}`);
  }
  return payload.response ?? {};
}

async function nativeFetch(input: string, init: Parameters<VkHttpFetch>[1]): Promise<VkHttpResponse> {
  const response = await fetch(input, init);
  return { ok: response.ok, status: response.status, text: () => response.text() };
}

function apiVersion(input: VkCallbackPreparationInput): string {
  return String(input.apiVersion ?? DEFAULT_API_VERSION).trim() || DEFAULT_API_VERSION;
}

function validateWebhookUrl(input: string): string {
  let url: URL;
  try { url = new URL(String(input ?? "").trim()); } catch { throw new Error("vk_webhook_url_invalid"); }
  if (url.protocol !== "https:" || url.port) throw new Error("vk_webhook_url_must_use_https_443");
  return url.toString();
}

function safeError(input: string): string {
  return String(input ?? "").replace(/\s+/g, " ").slice(0, 200) || "unknown";
}
