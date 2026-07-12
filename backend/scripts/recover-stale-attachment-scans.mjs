import { createPrismaClient } from "../packages/database/dist/index.js";
import { createObjectStorageSigner } from "../apps/api-gateway/dist/workspace/object-storage.js";

const client = createPrismaClient({ datasourceUrl: required(process.env.DATABASE_URL, "DATABASE_URL") });
const signer = createObjectStorageSigner(process.env);

try {
  const events = await client.outboxEvent.findMany({
    where: { queue: "file-scan", status: { in: ["dead_lettered", "failed"] }, type: "attachment.upload.requested" }
  });
  let replayed = 0;
  let superseded = 0;
  for (const event of events) {
    const descriptorId = text(event.payload?.descriptorId);
    const fileId = text(event.payload?.fileId);
    if (!descriptorId || !fileId) continue;
    const [descriptor, file] = await Promise.all([
      client.conversationOutboundDescriptor.findUnique({ where: { id: descriptorId } }),
      client.workspaceFile.findUnique({ where: { fileId } })
    ]);
    if (!descriptor || !file || file.storageState !== "uploaded" || !["pending", "scan_pending"].includes(file.scanState)) {
      await client.outboxEvent.delete({ where: { id: event.id } });
      superseded += 1;
      continue;
    }
    const signedFile = signer.signDownload({ fileId: file.fileId, fileName: file.fileName, objectKey: file.objectKey, tenantId: file.tenantId });
    await client.$transaction([
      client.conversationOutboundDescriptor.update({
        where: { id: descriptor.id },
        data: { payload: { ...object(descriptor.payload), signedFile } }
      }),
      client.outboxEvent.update({
        where: { id: event.id },
        data: { attempts: 0, deadLetteredAt: null, lastError: null, lockedAt: null, nextAttemptAt: null, status: "pending" }
      })
    ]);
    replayed += 1;
  }
  process.stdout.write(`Stale attachment scan recovery completed: replayed=${replayed}, superseded=${superseded}\n`);
} finally {
  await client.$disconnect?.();
}

function required(value, name) { const normalized = text(value); if (!normalized) throw new Error(`${name}_required`); return normalized; }
function text(value) { return typeof value === "string" ? value.trim() : ""; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
