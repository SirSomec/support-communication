import { createHash } from "node:crypto";
import type { IncomingHttpHeaders, IncomingMessage, Server } from "node:http";
import type { Socket } from "node:net";
import { resolveServiceAdminContextAsync } from "@support-communication/auth-context";
import type { BackendConfig } from "@support-communication/config";
import { ConversationService } from "./conversation.service.js";
import { IdentityRepository } from "../identity/identity.repository.js";
import { isServiceAdminSessionId } from "../identity/service-admin-auth.js";

const websocketGuid = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const realtimeReadAction = "realtime.events.read";

export interface RealtimeWebSocketReplayOptions {
  apiVersion: string;
  config: BackendConfig;
  conversationService: ConversationService;
}

export interface RealtimeWebSocketReplaySocket {
  destroyed: boolean;
  end(): void;
  write(value: Buffer | string): unknown;
}

export function installRealtimeWebSocketReplay(server: Server, options: RealtimeWebSocketReplayOptions): void {
  const socketPath = `/api/${options.apiVersion}/realtime/events/socket`;

  server.on("upgrade", (request: IncomingMessage, socket: Socket) => {
    void handleRealtimeUpgrade(request, socket, socketPath, options).catch(() => {
      writeUpgradeError(socket, 500, "Internal Server Error");
    });
  });
}

async function handleRealtimeUpgrade(
  request: IncomingMessage,
  socket: Socket,
  socketPath: string,
  options: RealtimeWebSocketReplayOptions
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (url.pathname !== socketPath) {
    writeUpgradeError(socket, 404, "Not Found");
    return;
  }

  const key = readHeader(request.headers, "sec-websocket-key");
  if (!key || readHeader(request.headers, "upgrade").toLowerCase() !== "websocket") {
    writeUpgradeError(socket, 400, "Bad Request");
    return;
  }

  const auth = await authorizeRealtimeSocket(request.headers, options.config);
  if (!auth.allowed) {
    writeUpgradeError(socket, auth.statusCode, auth.reason);
    return;
  }

  const accept = createHash("sha1").update(`${key}${websocketGuid}`).digest("base64");
  socket.write([
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${accept}`,
    "",
    ""
  ].join("\r\n"));

  const lastEventId = readHeader(request.headers, "last-event-id");
  const since = lastEventId || url.searchParams.get("since") || undefined;
  const limit = url.searchParams.get("limit") || undefined;
  await writeRealtimeWebSocketReplay(options.conversationService, socket, since, {
    ...(auth.tenantId ? { tenantId: auth.tenantId } : {})
  }, limit);
}

export async function writeRealtimeWebSocketReplay(
  conversationService: ConversationService,
  socket: RealtimeWebSocketReplaySocket,
  since?: string,
  scope: { tenantId?: string } = {},
  limit?: number | string
): Promise<void> {
  const envelope = await conversationService.fetchRealtimeEvents({ limit, since }, scope);
  for (const event of envelope.data.events) {
    writeTextFrame(socket, JSON.stringify(event));
  }
  writeCloseFrame(socket);
  socket.end();
}

export async function authorizeRealtimeSocket(headers: IncomingHttpHeaders, config: BackendConfig): Promise<{ allowed: true; tenantId?: string } | { allowed: false; reason: string; statusCode: number }> {
  const authorization = readHeader(headers, "authorization");
  if (/^Bearer\s+/i.test(authorization)) {
    let serviceAdminTenantId: string | undefined;
    const decision = await resolveServiceAdminContextAsync({
      headers,
      requiredAction: realtimeReadAction,
      sessionLookup: async (token) => {
        const session = await IdentityRepository.default().findServiceAdminSessionByAccessToken(token);
        if (!isServiceAdminSessionId(session?.id)) {
          return undefined;
        }
        serviceAdminTenantId = session?.currentTenantId || undefined;
        return session;
      }
    });

    return decision.allowed
      ? { allowed: true, ...(serviceAdminTenantId ? { tenantId: serviceAdminTenantId } : {}) }
      : {
          allowed: false,
          reason: `Service-admin session denied: ${decision.code}`,
          statusCode: decision.status === "unauthorized" ? 401 : 403
        };
  }

  if (!["development", "test"].includes(config.NODE_ENV)) {
    return { allowed: false, reason: "Bearer service-admin session is required for realtime sockets.", statusCode: 401 };
  }

  if (readHeader(headers, "x-demo-service-admin-key") !== config.DEMO_SERVICE_ADMIN_KEY) {
    return { allowed: false, reason: "Demo service-admin key is required for realtime sockets.", statusCode: 401 };
  }

  const actorId = readHeader(headers, "x-demo-service-admin-actor-id");
  const actorName = readHeader(headers, "x-demo-service-admin-actor-name");
  const mfaVerified = readHeader(headers, "x-demo-service-admin-mfa-verified") === "true";
  const expiresAt = Date.parse(readHeader(headers, "x-demo-service-admin-session-expires-at"));
  const permissions = readHeader(headers, "x-demo-service-admin-permissions")
    .split(",")
    .map((permission) => permission.trim())
    .filter(Boolean);

  if (!actorId || !actorName) {
    return { allowed: false, reason: "A named service-admin actor is required for realtime sockets.", statusCode: 403 };
  }

  if (!mfaVerified || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return { allowed: false, reason: "A verified, non-expired service-admin session is required for realtime sockets.", statusCode: 403 };
  }

  if (!permissions.includes("*") && !permissions.includes(realtimeReadAction)) {
    return { allowed: false, reason: `Service-admin permission ${realtimeReadAction} is required for realtime sockets.`, statusCode: 403 };
  }

  const tenantId = readHeader(headers, "x-demo-service-admin-tenant-id");
  return { allowed: true, ...(tenantId ? { tenantId } : {}) };
}

function writeUpgradeError(socket: Socket, statusCode: number, reason: string): void {
  if (socket.destroyed) {
    return;
  }

  socket.end([
    `HTTP/1.1 ${statusCode} ${reason}`,
    "Connection: close",
    "Content-Length: 0",
    "",
    ""
  ].join("\r\n"));
}

function writeTextFrame(socket: Pick<RealtimeWebSocketReplaySocket, "write">, value: string): void {
  const payload = Buffer.from(value, "utf8");
  const length = payload.length;
  const header = length < 126
    ? Buffer.from([0x81, length])
    : length <= 65_535
      ? Buffer.from([0x81, 126, (length >> 8) & 0xff, length & 0xff])
      : createLongFrameHeader(length);

  socket.write(Buffer.concat([header, payload]));
}

function writeCloseFrame(socket: Pick<RealtimeWebSocketReplaySocket, "write">): void {
  socket.write(Buffer.from([0x88, 0x00]));
}

function createLongFrameHeader(length: number): Buffer {
  const header = Buffer.alloc(10);
  header[0] = 0x81;
  header[1] = 127;
  header.writeBigUInt64BE(BigInt(length), 2);
  return header;
}

function readHeader(headers: IncomingHttpHeaders, name: string): string {
  const direct = headers[name] ?? headers[name.toLowerCase()];
  const value = Array.isArray(direct) ? direct[0] : direct;
  return value?.trim() ?? "";
}
