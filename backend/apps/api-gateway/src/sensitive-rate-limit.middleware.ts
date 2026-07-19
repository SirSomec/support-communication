import { createHash } from "node:crypto";
import { Redis } from "ioredis";

interface RateLimitPolicy {
  accountLimit: number;
  ipLimit: number;
  name: string;
  path: RegExp;
  windowSeconds: number;
}

interface RateLimitRequest {
  body?: { email?: unknown };
  headers: Record<string, string | string[] | undefined>;
  method?: string;
  originalUrl?: string;
  socket?: { remoteAddress?: string };
}

interface RateLimitResponse {
  end(body?: string): void;
  setHeader(name: string, value: string): void;
  statusCode: number;
}

const policies: RateLimitPolicy[] = [
  policy("service_admin_login", /^POST \/api\/v1\/auth\/login$/, 30, 10, 300),
  policy("tenant_login", /^POST \/api\/v1\/auth\/tenant\/login$/, 30, 10, 300),
  policy("invite_accept", /^POST \/api\/v1\/auth\/invites\/accept$/, 20, 8, 300),
  policy("recovery_request", /^POST \/api\/v1\/auth\/recovery\/request$/, 10, 3, 900),
  policy("recovery_complete", /^POST \/api\/v1\/auth\/recovery\/complete$/, 20, 8, 900),
  policy("oidc_start", /^POST \/api\/v1\/auth\/oidc\/start$/, 30, 10, 300),
  policy("saml_acs", /^POST \/api\/v1\/auth\/saml\/acs$/, 60, 0, 300),
  policy("public_demo_request", /^POST \/api\/v1\/public\/demo-requests\/?$/, 20, 3, 3_600),
  policy("public_sdk", /^(?:GET|POST) \/api\/v1\/public\/sdk\/.+$/, 600, 0, 60),
  policy("telegram_webhook", /^POST \/api\/v1\/webhooks\/telegram$/, 600, 0, 60),
  policy("provider_webhook", /^POST \/api\/v1\/webhooks\/(?:vk|max)\/[^/]+$/, 600, 0, 60),
  policy("open_channel_ingress", /^POST \/api\/v1\/open-channel\/[^/]+$/, 300, 0, 60),
  policy("external_bot_webhook", /^POST \/api\/v1\/external-bot\/webhooks\/[^/]+\/[^/]+$/, 300, 0, 60)
];

const incrementScript = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return current
`;

let redis: Redis | undefined;
let connectPromise: Promise<void> | undefined;
let redisUnavailableUntil = 0;

export async function sensitiveRateLimitMiddleware(
  request: RateLimitRequest,
  response: RateLimitResponse,
  next: () => void
): Promise<void> {
  if (process.env.AUTH_RATE_LIMIT_ENABLED === "false") {
    next();
    return;
  }

  const policy = selectSensitiveRateLimitPolicy(request.method, request.originalUrl);
  if (!policy) {
    next();
    return;
  }

  const productionLike = process.env.NODE_ENV === "production" || process.env.NODE_ENV === "staging";
  if (!productionLike && Date.now() < redisUnavailableUntil) {
    next();
    return;
  }

  try {
    const client = await rateLimitRedis();
    const ip = resolveClientAddress(request);
    const email = normalizeEmail(request.body?.email);
    const counts = await Promise.all([
      increment(client, rateLimitKey(policy.name, "ip", ip), policy.windowSeconds),
      ...(email && policy.accountLimit > 0
        ? [increment(client, rateLimitKey(policy.name, "account", email), policy.windowSeconds)]
        : [])
    ]);
    const ipExceeded = counts[0]! > policy.ipLimit;
    const accountExceeded = counts.length > 1 && counts[1]! > policy.accountLimit;
    if (ipExceeded || accountExceeded) {
      respond(response, 429, "rate_limit_exceeded", "Too many requests. Try again later.", policy.windowSeconds);
      return;
    }
    next();
  } catch {
    if (productionLike) {
      respond(response, 503, "rate_limit_unavailable", "This endpoint is temporarily unavailable.");
      return;
    }
    redisUnavailableUntil = Date.now() + 5_000;
    next();
  }
}

export function selectSensitiveRateLimitPolicy(method: string | undefined, originalUrl: string | undefined): RateLimitPolicy | undefined {
  const path = String(originalUrl || "").split("?", 1)[0];
  const route = `${String(method || "GET").toUpperCase()} ${path}`;
  return policies.find((candidate) => candidate.path.test(route));
}

export function resolveClientAddress(request: RateLimitRequest): string {
  if (process.env.TRUST_PROXY_HEADERS === "true") {
    const forwarded = request.headers["x-forwarded-for"];
    const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",", 1)[0]?.trim();
    if (first) return first.slice(0, 128);
  }
  return String(request.socket?.remoteAddress || "unknown").slice(0, 128);
}

export function rateLimitKey(policy: string, dimension: "account" | "ip", value: string): string {
  const digest = createHash("sha256").update(value).digest("hex");
  return `support:rate-limit:${policy}:${dimension}:${digest}`;
}

async function rateLimitRedis(): Promise<Redis> {
  const url = String(process.env.REDIS_URL || "").trim();
  if (!url) throw new Error("redis_url_required");
  if (!redis || redis.status === "end") {
    redis = new Redis(url, {
      connectTimeout: process.env.NODE_ENV === "production" || process.env.NODE_ENV === "staging" ? 1_500 : 250,
      enableOfflineQueue: false,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null
    });
    // Connection failures are handled by the request path below. Registering a
    // listener prevents ioredis from emitting process-level unhandled errors.
    redis.on("error", () => undefined);
  }
  if (redis.status === "wait") {
    connectPromise ??= redis.connect().finally(() => { connectPromise = undefined; });
    await connectPromise;
  }
  return redis;
}

async function increment(client: Redis, key: string, windowSeconds: number): Promise<number> {
  const result = await client.eval(incrementScript, 1, key, String(windowSeconds));
  return Number(result);
}

function normalizeEmail(value: unknown): string | undefined {
  const email = String(value || "").trim().toLowerCase();
  return email && email.length <= 320 ? email : undefined;
}

function policy(name: string, path: RegExp, ipLimit: number, accountLimit: number, windowSeconds: number): RateLimitPolicy {
  return { accountLimit, ipLimit, name, path, windowSeconds };
}

function respond(response: RateLimitResponse, status: number, code: string, message: string, retryAfter?: number): void {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  if (retryAfter) response.setHeader("Retry-After", String(retryAfter));
  response.end(JSON.stringify({ error: { code, message }, status: "error" }));
}
