import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client");

const PILOT_TENANT_ID = "tenant-pilot-001";
const PILOT_OPERATOR_ID = "usr-pilot-operator";
const PILOT_API_KEY_ID = "key-pilot-sdk-stage";

const tenantSlug = String(process.env.PILOT_TENANT_SLUG ?? "pilot-client").trim() || "pilot-client";
const operatorEmail = String(process.env.PILOT_OPERATOR_EMAIL ?? "operator@pilot-client.test").trim().toLowerCase();
const operatorPassword = String(process.env.PILOT_OPERATOR_PASSWORD ?? "Pilot-Operator-2026!");
const integrationStoreFile = resolve(
  process.cwd(),
  String(process.env.INTEGRATION_STORE_FILE ?? ".runtime/integration-store.json").trim()
    || ".runtime/integration-store.json"
);

runNpmScript("identity:bootstrap:postgres");

const prisma = new PrismaClient();

try {
  const rawSecret = generateStagePublicApiKeySecret();
  const keyPreview = maskPublicApiKeySecret(rawSecret);
  const createdAt = new Date().toISOString();

  await upsertPilotTenant(prisma, tenantSlug);
  await upsertPilotOperator(prisma, operatorEmail);
  await upsertPilotPasswordCredential(prisma, operatorEmail, operatorPassword);

  const prismaKeySaved = await upsertPilotPublicApiKeyPrisma(prisma, {
    createdAt,
    keyPreview,
    rawSecret,
    tenantId: PILOT_TENANT_ID
  });
  const jsonKeySaved = savePilotPublicApiKeyJson({
    createdAt,
    keyPreview,
    rawSecret,
    tenantId: PILOT_TENANT_ID
  });

  const summary = {
    tenantId: PILOT_TENANT_ID,
    operatorEmail,
    publicApiKeyPrefix: keyPreview
  };

  process.stderr.write(
    `[pilot:bootstrap] Public API key storage: prisma=${prismaKeySaved ? "yes" : "no"}, json=${jsonKeySaved ? "yes" : "no"} (${integrationStoreFile})\n`
  );
  process.stderr.write("[pilot:bootstrap] === PUBLIC API KEY (shown once) ===\n");
  process.stderr.write(`${rawSecret}\n`);
  process.stderr.write("[pilot:bootstrap] =====================================\n");
  process.stdout.write(`${JSON.stringify(summary)}\n`);
} finally {
  await prisma.$disconnect();
}

function runNpmScript(script) {
  process.stdout.write(`Running npm run ${script}...\n`);
  const result = spawnSync("npm", ["run", script], {
    cwd: process.cwd(),
    env: process.env,
    shell: true,
    stdio: "inherit"
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.stderr.write(`npm run ${script} failed with exit code ${result.status ?? 1}.\n`);
    process.exit(result.status ?? 1);
  }
}

async function upsertPilotTenant(client, slug) {
  const metadata = {
    slug,
    pilot: true,
    owner: "Pilot Client",
    ownerEmail: operatorEmail,
    planId: "pilot",
    region: "staging",
    domains: [`${slug}.example`],
    flags: [],
    incidentIds: [],
    notes: "First client pilot tenant created by pilot:bootstrap."
  };

  await client.tenant.upsert({
    create: {
      healthScore: 100,
      id: PILOT_TENANT_ID,
      metadata,
      name: "Pilot Client",
      status: "active"
    },
    update: {
      healthScore: 100,
      metadata,
      name: "Pilot Client",
      status: "active"
    },
    where: { id: PILOT_TENANT_ID }
  });
}

async function upsertPilotOperator(client, email) {
  await client.tenantUser.upsert({
    create: {
      device: "Pilot bootstrap",
      email,
      id: PILOT_OPERATOR_ID,
      inviteStatus: "accepted",
      lastActiveAt: null,
      metadata: { pilot: true },
      mfa: "disabled",
      name: "Pilot Operator",
      risk: "low",
      role: "Admin",
      sessions: 0,
      status: "active",
      supportNotes: "Created by pilot:bootstrap for first client pilot.",
      tenantId: PILOT_TENANT_ID
    },
    update: {
      device: "Pilot bootstrap",
      email,
      metadata: { pilot: true },
      mfa: "disabled",
      name: "Pilot Operator",
      role: "Admin",
      status: "active",
      supportNotes: "Created by pilot:bootstrap for first client pilot.",
      tenantId: PILOT_TENANT_ID
    },
    where: { id: PILOT_OPERATOR_ID }
  });
}

async function upsertPilotPasswordCredential(client, email, password) {
  await client.passwordCredential.upsert({
    create: {
      algorithm: "sha256",
      email,
      hash: hashPasswordCredential(password),
      subjectId: PILOT_OPERATOR_ID,
      updatedAt: new Date(),
      version: 1
    },
    update: {
      hash: hashPasswordCredential(password),
      subjectId: PILOT_OPERATOR_ID,
      updatedAt: new Date(),
      version: 1
    },
    where: { email }
  });
}

async function upsertPilotPublicApiKeyPrisma(client, input) {
  try {
    const now = new Date(input.createdAt);
    const secretHash = hashPublicApiKeySecret(input.rawSecret);

    await client.publicApiKey.upsert({
      create: {
        createdAt: now,
        environment: "stage",
        keyId: PILOT_API_KEY_ID,
        keyPreview: input.keyPreview,
        name: "Pilot SDK stage key",
        owner: "Pilot bootstrap",
        scopes: ["clients:identify", "conversations:write"],
        secretHash,
        status: "active",
        tenantId: input.tenantId,
        updatedAt: now
      },
      update: {
        environment: "stage",
        keyPreview: input.keyPreview,
        name: "Pilot SDK stage key",
        owner: "Pilot bootstrap",
        scopes: ["clients:identify", "conversations:write"],
        secretHash,
        status: "active",
        tenantId: input.tenantId,
        updatedAt: now
      },
      where: { keyId: PILOT_API_KEY_ID }
    });

    await client.publicApiKeyRevealState.upsert({
      create: {
        consumedAt: null,
        createdAt: now,
        keyId: PILOT_API_KEY_ID,
        keyPreview: input.keyPreview,
        status: "available"
      },
      update: {
        consumedAt: null,
        keyPreview: input.keyPreview,
        status: "available"
      },
      where: { keyId: PILOT_API_KEY_ID }
    });

    return true;
  } catch (error) {
    process.stderr.write(
      `[pilot:bootstrap] Prisma public API key persistence skipped: ${error instanceof Error ? error.message : String(error)}\n`
    );
    return false;
  }
}

function savePilotPublicApiKeyJson(input) {
  try {
    mkdirSync(dirname(integrationStoreFile), { recursive: true });
    const state = readIntegrationStore(integrationStoreFile);
    const secretHash = hashPublicApiKeySecret(input.rawSecret);
    const keyRecord = {
      createdAt: input.createdAt,
      environment: "stage",
      keyId: PILOT_API_KEY_ID,
      keyPreview: input.keyPreview,
      name: "Pilot SDK stage key",
      owner: "Pilot bootstrap",
      scopes: ["clients:identify", "conversations:write"],
      secretHash,
      status: "active",
      tenantId: input.tenantId
    };
    const revealState = {
      consumedAt: null,
      createdAt: input.createdAt,
      keyId: PILOT_API_KEY_ID,
      keyPreview: input.keyPreview,
      status: "available"
    };

    const publicApiKeys = state.publicApiKeys.filter((item) => item.keyId !== PILOT_API_KEY_ID);
    publicApiKeys.push(keyRecord);

    const publicApiKeyRevealStates = state.publicApiKeyRevealStates.filter((item) => item.keyId !== PILOT_API_KEY_ID);
    publicApiKeyRevealStates.push(revealState);

    writeFileSync(integrationStoreFile, `${JSON.stringify({
      ...state,
      publicApiKeys,
      publicApiKeyRevealStates
    }, null, 2)}\n`, "utf8");

    return true;
  } catch (error) {
    process.stderr.write(
      `[pilot:bootstrap] JSON integration store persistence failed: ${error instanceof Error ? error.message : String(error)}\n`
    );
    return false;
  }
}

function readIntegrationStore(filePath) {
  try {
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return {
      apiKeyRotationAuditEvents: parsed.apiKeyRotationAuditEvents ?? [],
      apiKeyRotationJobs: parsed.apiKeyRotationJobs ?? [],
      publicApiKeys: parsed.publicApiKeys ?? [],
      publicApiKeyRevealStates: parsed.publicApiKeyRevealStates ?? [],
      securitySessions: parsed.securitySessions ?? [],
      webhookDeliveryJournal: parsed.webhookDeliveryJournal ?? [],
      webhookReplayAuditEvents: parsed.webhookReplayAuditEvents ?? [],
      webhookReplayJournal: parsed.webhookReplayJournal ?? []
    };
  } catch {
    return {
      apiKeyRotationAuditEvents: [],
      apiKeyRotationJobs: [],
      publicApiKeys: [],
      publicApiKeyRevealStates: [],
      securitySessions: [],
      webhookDeliveryJournal: [],
      webhookReplayAuditEvents: [],
      webhookReplayJournal: []
    };
  }
}

function generateStagePublicApiKeySecret() {
  return `sk_test_pilot_${randomBytes(16).toString("hex")}`;
}

function hashPasswordCredential(password) {
  return `sha256:${createHash("sha256").update(password).digest("hex")}`;
}

function hashPublicApiKeySecret(rawSecret) {
  return createHash("sha256").update(rawSecret.trim()).digest("hex");
}

function maskPublicApiKeySecret(rawSecret) {
  const trimmed = rawSecret.trim();
  const prefix = trimmed.startsWith("sk_test_") ? "sk_test" : trimmed.startsWith("sk_live_") ? "sk_live" : "key";
  const suffix = trimmed.length > 4 ? trimmed.slice(-4) : "****";
  return `${prefix}_****_${suffix}`;
}
