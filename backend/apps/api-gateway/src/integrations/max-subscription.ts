export interface MaxHttpResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export type MaxHttpFetch = (input: string, init: {
  body?: string;
  headers?: Record<string, string>;
  method?: string;
  signal?: AbortSignal;
}) => Promise<MaxHttpResponse>;

export interface MaxWebhookSubscriptionInput {
  accessToken: string;
  apiBaseUrl?: string;
  fetcher?: MaxHttpFetch;
  secret: string;
  updateTypes?: string[];
  webhookUrl: string;
}

const DEFAULT_MAX_API_BASE_URL = "https://platform-api2.max.ru";
const DEFAULT_UPDATE_TYPES = ["message_created", "bot_started"];

/** Registers the only production ingress supported by MAX Bot API. */
export async function subscribeMaxWebhook(input: MaxWebhookSubscriptionInput): Promise<void> {
  const accessToken = required(input.accessToken, "max_access_token_required");
  const webhookUrl = validateWebhookUrl(input.webhookUrl);
  const secret = validateSecret(input.secret);
  const apiBaseUrl = validateApiBaseUrl(input.apiBaseUrl ?? DEFAULT_MAX_API_BASE_URL);
  const fetcher = input.fetcher ?? nativeFetch;
  const response = await fetcher(`${apiBaseUrl}/subscriptions`, {
    body: JSON.stringify({
      secret,
      update_types: input.updateTypes?.length ? input.updateTypes : DEFAULT_UPDATE_TYPES,
      url: webhookUrl
    }),
    headers: { Authorization: accessToken, "Content-Type": "application/json" },
    method: "POST",
    signal: AbortSignal.timeout(10_000)
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`max_subscription_failed:${response.status}:${safeError(body)}`);
  let parsed: Record<string, unknown> | undefined;
  try { parsed = JSON.parse(body) as Record<string, unknown>; } catch { /* MAX may return an empty successful response. */ }
  if (parsed?.success === false) throw new Error(`max_subscription_rejected:${safeError(String(parsed.message ?? "unknown"))}`);
}

async function nativeFetch(input: string, init: Parameters<MaxHttpFetch>[1]): Promise<MaxHttpResponse> {
  const response = await fetch(input, init);
  return { ok: response.ok, status: response.status, text: () => response.text() };
}

function validateWebhookUrl(input: string): string {
  let url: URL;
  try { url = new URL(required(input, "max_webhook_url_required")); } catch { throw new Error("max_webhook_url_invalid"); }
  if (url.protocol !== "https:" || url.port) throw new Error("max_webhook_url_must_use_https_443");
  return url.toString();
}

function validateApiBaseUrl(input: string): string {
  let url: URL;
  try { url = new URL(required(input, "max_api_base_url_required")); } catch { throw new Error("max_api_base_url_invalid"); }
  if (url.protocol !== "https:") throw new Error("max_api_base_url_must_use_https");
  return url.toString().replace(/\/+$/, "");
}

function validateSecret(input: string): string {
  const value = required(input, "max_webhook_secret_required");
  if (!/^[A-Za-z0-9_-]{5,256}$/.test(value)) throw new Error("max_webhook_secret_invalid");
  return value;
}

function required(input: string, code: string): string {
  const value = String(input ?? "").trim();
  if (!value) throw new Error(code);
  return value;
}

function safeError(input: string): string {
  return String(input ?? "").replace(/\s+/g, " ").slice(0, 200) || "unknown";
}
