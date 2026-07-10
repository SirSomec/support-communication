import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const backendRoot = fileURLToPath(new URL("..", import.meta.url));
const evaluatedAt = "2026-06-30T08:30:00.000Z";
const smoke = {
  channel: "Telegram",
  idempotencyKey: "proactive-delivery:tenant-smoke:rule-smoke:visitor-smoke",
  ruleId: "rule-smoke",
  segment: "checkout",
  subjectId: "visitor-smoke",
  tenantId: "tenant-smoke",
  traceId: "trc_proactive_delivery_worker_smoke"
};
const temporaryDirectory = await mkdtemp(join(tmpdir(), "proactive-delivery-worker-smoke-"));
const automationStoreFile = join(temporaryDirectory, "automation.json");
const conversationStoreFile = join(temporaryDirectory, "conversation.json");

try {
  await Promise.all([
    writeJson(automationStoreFile, createAutomationSeed()),
    writeJson(conversationStoreFile, createConversationSeed())
  ]);

  const output = await runWorkerOnce();
  const result = parseWorkerRunResult(output.stdout);
  if (
    result.queued !== 1
    || result.failed !== 0
    || result.scanned !== 1
    || result.skipped !== 0
    || result.duplicate !== 0
    || result.conflicted !== 0
  ) {
    throw new Error(`proactive_delivery_worker_smoke_unexpected_result:${JSON.stringify(result)}`);
  }

  const [automationState, conversationState] = await Promise.all([
    readJson(automationStoreFile),
    readJson(conversationStoreFile)
  ]);
  const evidence = assertPersistedDelivery(automationState, conversationState);

  process.stdout.write(`proactive delivery worker smoke passed ${JSON.stringify({
    descriptorId: evidence.descriptor.id,
    outboxEventId: evidence.outbox.id,
    result
  })}\n`);
} finally {
  await rm(temporaryDirectory, { force: true, recursive: true });
}

function createAutomationSeed() {
  return {
    activeVisitors: [{
      channel: smoke.channel,
      message: "A support specialist is available to help with checkout.",
      phone: "+70000000000",
      segment: smoke.segment,
      subjectId: smoke.subjectId,
      tenantId: smoke.tenantId,
      topic: "Checkout assistance"
    }],
    botPublishAuditEvents: [],
    botScenarios: [],
    botScenarioVersions: [],
    botTestRuns: [],
    proactiveDeliveryAttributions: [],
    proactiveDeliveryAttempts: [],
    proactiveDeliveryIdempotencyKeys: [],
    proactiveExecutionWindows: [{
      active: true,
      daysOfWeek: [2],
      endsAt: "12:00",
      ruleId: smoke.ruleId,
      startsAt: "08:00",
      tenantId: smoke.tenantId,
      timezone: "UTC",
      windowId: "window-smoke"
    }],
    proactiveExperimentAssignments: [],
    proactiveFrequencyCaps: [{
      active: true,
      capId: "cap-smoke",
      limit: 1,
      period: "day",
      resetAt: "2026-07-01T00:00:00.000Z",
      ruleId: smoke.ruleId,
      tenantId: smoke.tenantId,
      used: 0
    }],
    proactiveRules: [{
      activeVariant: "A",
      channels: [smoke.channel],
      id: smoke.ruleId,
      segment: smoke.segment,
      status: "enabled",
      tenantId: smoke.tenantId
    }],
    publishIdempotencyKeys: [],
    rescueChats: [],
    workspaceAuditEvents: [],
    workspaceRuntimeMetrics: []
  };
}

function createConversationSeed() {
  return {
    channelCatalog: [],
    conversations: [],
    deliveryReceipts: [],
    inboundEvents: [],
    outboundDescriptors: [],
    outboxEvents: [],
    realtimeEvents: []
  };
}

async function runWorkerOnce() {
  const env = {
    ...process.env,
    AUTOMATION_REPOSITORY: "json",
    AUTOMATION_STORE_FILE: automationStoreFile,
    CONVERSATION_REPOSITORY: "json",
    CONVERSATION_STORE_FILE: conversationStoreFile,
    NODE_ENV: "production",
    PROACTIVE_DELIVERY_ACTIVE_VARIANTS: "A",
    PROACTIVE_DELIVERY_EVALUATED_AT: evaluatedAt,
    PROACTIVE_DELIVERY_LIMIT: "1",
    PROACTIVE_DELIVERY_TRACE_ID: smoke.traceId,
    SERVICE_NAME: "proactive-delivery-worker-smoke"
  };
  const child = spawn(process.execPath, [
    "apps/api-gateway/dist/automation/proactive-delivery.main.js",
    "--once"
  ], {
    cwd: backendRoot,
    env,
    windowsHide: true
  });
  let stdout = "";
  let stderr = "";

  child.stdout?.on("data", (chunk) => {
    stdout += chunk.toString("utf8");
    process.stdout.write(chunk);
  });
  child.stderr?.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
    process.stderr.write(chunk);
  });

  return new Promise((resolve, reject) => {
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, 30_000);

    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      if (timedOut) {
        reject(new Error("proactive_delivery_worker_process_timeout"));
        return;
      }
      if (code !== 0) {
        reject(new Error(`proactive_delivery_worker_process_failed:${code ?? 1}:${stderr || stdout}`));
        return;
      }
      resolve({ stderr, stdout });
    });
  });
}

function parseWorkerRunResult(stdout) {
  const records = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .reverse();
  const workerRecord = records.find((record) => record.service === "proactive-delivery-worker" && record.result);
  if (!workerRecord) {
    throw new Error("proactive_delivery_worker_result_not_found");
  }
  return workerRecord.result;
}

function assertPersistedDelivery(automationState, conversationState) {
  const descriptors = requireArray(conversationState.outboundDescriptors, "outbound_descriptors");
  const outboxEvents = requireArray(conversationState.outboxEvents, "outbox_events");
  const attempts = requireArray(automationState.proactiveDeliveryAttempts, "delivery_attempts");
  const idempotencyRecords = requireArray(
    automationState.proactiveDeliveryIdempotencyKeys,
    "delivery_idempotency_keys"
  );
  const attributions = requireArray(automationState.proactiveDeliveryAttributions, "delivery_attributions");

  assertExactlyOne(descriptors, "outbound_descriptor");
  assertExactlyOne(outboxEvents, "outbox_event");
  assertExactlyOne(attempts, "delivery_attempt");
  assertExactlyOne(idempotencyRecords, "delivery_idempotency_key");
  assertExactlyOne(attributions, "delivery_attribution");

  const descriptor = descriptors[0];
  const outbox = outboxEvents[0];
  const attempt = attempts[0];
  const idempotency = idempotencyRecords[0];
  const attribution = attributions[0];

  if (
    descriptor.idempotencyKey !== smoke.idempotencyKey
    || descriptor.tenantId !== smoke.tenantId
    || descriptor.traceId !== smoke.traceId
    || descriptor.createdAt !== evaluatedAt
    || descriptor.status !== "queued"
    || descriptor.deliveryState !== "queued"
    || descriptor.outboxEventId !== outbox.id
  ) {
    throw new Error(`proactive_delivery_worker_smoke_descriptor_mismatch:${JSON.stringify(descriptor)}`);
  }
  if (
    outbox.aggregateId !== descriptor.id
    || outbox.queue !== "message-delivery"
    || outbox.traceId !== smoke.traceId
    || outbox.type !== "conversation.outbound.requested"
  ) {
    throw new Error(`proactive_delivery_worker_smoke_outbox_mismatch:${JSON.stringify(outbox)}`);
  }
  if (
    attempt.attemptedAt !== evaluatedAt
    || attempt.descriptorId !== descriptor.id
    || attempt.ruleId !== smoke.ruleId
    || attempt.status !== "queued"
    || attempt.subjectId !== smoke.subjectId
    || attempt.tenantId !== smoke.tenantId
  ) {
    throw new Error(`proactive_delivery_worker_smoke_attempt_mismatch:${JSON.stringify(attempt)}`);
  }
  if (
    idempotency.key !== smoke.idempotencyKey
    || idempotency.fingerprint !== descriptor.requestFingerprint
    || idempotency.result?.descriptorId !== descriptor.id
    || idempotency.result?.outboxEventId !== outbox.id
  ) {
    throw new Error(`proactive_delivery_worker_smoke_idempotency_mismatch:${JSON.stringify(idempotency)}`);
  }
  if (
    attribution.assignedAt !== evaluatedAt
    || attribution.descriptorId !== descriptor.id
    || attribution.ruleId !== smoke.ruleId
    || attribution.subjectId !== smoke.subjectId
    || attribution.tenantId !== smoke.tenantId
    || attribution.variant !== "A"
  ) {
    throw new Error(`proactive_delivery_worker_smoke_attribution_mismatch:${JSON.stringify(attribution)}`);
  }

  return { descriptor, outbox };
}

function requireArray(value, name) {
  if (!Array.isArray(value)) {
    throw new Error(`proactive_delivery_worker_smoke_${name}_missing`);
  }
  return value;
}

function assertExactlyOne(records, name) {
  if (records.length !== 1) {
    throw new Error(`proactive_delivery_worker_smoke_${name}_count:${records.length}`);
  }
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}
