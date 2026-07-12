import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { connect } from "node:net";

const port = positiveInteger(process.env.CLAMAV_SCANNER_HTTP_PORT, 4120);
const clamHost = process.env.CLAMAV_HOST?.trim() || "clamav";
const clamPort = positiveInteger(process.env.CLAMAV_PORT, 3310);
const maxBytes = positiveInteger(process.env.CLAMAV_MAX_FILE_BYTES, 20 * 1024 * 1024);
const timeoutMs = positiveInteger(process.env.CLAMAV_TIMEOUT_MS, 30_000);

createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    return json(response, 200, { status: "ok" });
  }
  if (request.method !== "POST" || request.url !== "/scan") {
    return json(response, 404, { error: "not_found" });
  }

  try {
    const payload = JSON.parse(await readRequestBody(request, 64 * 1024)) as Record<string, unknown>;
    const scanRequest = objectValue(payload.request);
    const signedFile = objectValue(scanRequest?.signedFile);
    const url = stringValue(signedFile?.url);
    if (payload.operation !== "scanAttachment" || !url) throw new Error("signed_file_required");

    const fileResponse = await fetch(url, {
      headers: stringRecord(signedFile?.headers),
      method: "GET",
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!fileResponse.ok) throw new Error(`signed_file_download_failed:${fileResponse.status}`);
    const body = Buffer.from(await fileResponse.arrayBuffer());
    if (body.length > maxBytes) throw new Error("file_too_large");

    const result = await scanWithClamAv(body);
    return json(response, 200, {
      checkedAt: new Date().toISOString(),
      reason: result.reason,
      scanner: "clamav",
      verdict: result.infected ? "infected" : "clean"
    });
  } catch (error) {
    return json(response, 503, { error: error instanceof Error ? error.message : "scan_failed" });
  }
}).listen(port, "0.0.0.0");

function scanWithClamAv(body: Buffer): Promise<{ infected: boolean; reason: string }> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host: clamHost, port: clamPort });
    let output = "";
    const timer = setTimeout(() => socket.destroy(new Error("clamav_timeout")), timeoutMs);
    socket.on("connect", () => {
      socket.write("zINSTREAM\0");
      for (let offset = 0; offset < body.length; offset += 64 * 1024) {
        const chunk = body.subarray(offset, offset + 64 * 1024);
        const size = Buffer.alloc(4);
        size.writeUInt32BE(chunk.length);
        socket.write(size);
        socket.write(chunk);
      }
      socket.end(Buffer.alloc(4));
    });
    socket.on("data", (chunk) => { output += chunk.toString("utf8"); });
    socket.on("error", (error) => { clearTimeout(timer); reject(error); });
    socket.on("close", () => {
      clearTimeout(timer);
      if (/\bOK\b/.test(output)) return resolve({ infected: false, reason: "No threat detected" });
      const match = /stream:\s+(.+?)\s+FOUND/.exec(output);
      if (match) return resolve({ infected: true, reason: match[1] });
      reject(new Error(`clamav_invalid_response:${output.trim()}`));
    });
  });
}

async function readRequestBody(request: IncomingMessage, limit: number): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > limit) throw new Error("request_too_large");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function json(response: ServerResponse, status: number, body: Record<string, unknown>): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stringRecord(value: unknown): Record<string, string> | undefined {
  const record = objectValue(value);
  if (!record) return undefined;
  return Object.fromEntries(Object.entries(record).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? fallback);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
