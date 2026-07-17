import { spawnSync } from "node:child_process";
import { createHash, randomBytes, scryptSync } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client");

const BOOTSTRAP_TENANT_ID = "tenant-local-001";
const BOOTSTRAP_OPERATOR_ID = "usr-local-operator";
const BOOTSTRAP_API_KEY_ID = "key-local-sdk-stage";

const tenantSlug = String(process.env.BOOTSTRAP_TENANT_SLUG ?? "local-client").trim() || "local-client";
const operatorEmail = String(process.env.BOOTSTRAP_OPERATOR_EMAIL ?? "operator@local-client.test").trim().toLowerCase();
const operatorPassword = String(process.env.BOOTSTRAP_OPERATOR_PASSWORD ?? "Local-Operator-2026!");

runNpmScript("identity:bootstrap:postgres");

const prisma = new PrismaClient();

try {
  const rawSecret = generateStagePublicApiKeySecret();
  const keyPreview = maskPublicApiKeySecret(rawSecret);
  const createdAt = new Date().toISOString();

  await upsertBootstrapTenant(prisma, tenantSlug);
  await upsertBootstrapOperator(prisma, operatorEmail);
  await upsertBootstrapPasswordCredential(prisma, operatorEmail, operatorPassword);
  await seedDomainCatalog(prisma, ["tenant-volga", BOOTSTRAP_TENANT_ID]);
  const keySaved = await upsertBootstrapPublicApiKey(prisma, {
    createdAt,
    keyPreview,
    rawSecret,
    tenantId: BOOTSTRAP_TENANT_ID
  });

  const summary = {
    tenantId: BOOTSTRAP_TENANT_ID,
    operatorEmail,
    publicApiKeyPrefix: keyPreview
  };

  process.stderr.write(`[bootstrap:local] Public API key storage: prisma=${keySaved ? "yes" : "no"}\n`);
  process.stderr.write("[bootstrap:local] === PUBLIC API KEY (shown once) ===\n");
  process.stderr.write(`${rawSecret}\n`);
  process.stderr.write("[bootstrap:local] =====================================\n");
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

async function seedDomainCatalog(client, tenantIds) {
  const automationCatalog = loadSeedCatalog("../apps/api-gateway/dist/automation/seed-catalog.js");
  const qualityCatalog = loadSeedCatalog("../apps/api-gateway/dist/quality/seed-catalog.js");
  if (!automationCatalog && !qualityCatalog) {
    process.stderr.write("[bootstrap:local] Domain catalog seed skipped: compiled seed catalogs are unavailable.\n");
    return;
  }

  const now = new Date();
  for (const tenantId of tenantIds) {
    if (automationCatalog?.botScenarios) {
      for (const [index, scenario] of automationCatalog.botScenarios.entries()) {
        const scenarioId = `${scenario.id}-${tenantId.replace(/^tenant-/, "")}`;
        const mapped = mapSeedBotScenarioStatus(scenario.status);
        const triggerRules = Array.isArray(scenario.triggerRules) && scenario.triggerRules.length
          ? scenario.triggerRules
          : [{ id: "seed-new-conversation", priority: 0, type: "new_conversation" }];
        const scenarioPayload = {
          channels: scenario.channels ?? [],
          enabled: mapped.enabled,
          flowEdges: scenario.flowEdges ?? [],
          flowNodes: scenario.flowNodes ?? [],
          name: scenario.name,
          priority: Number(scenario.priority ?? index),
          schemaVersion: scenario.schemaVersion ?? "bot-flow/v1",
          sourceBindings: scenario.sourceBindings ?? [],
          status: mapped.status,
          tenantId,
          triggerRules,
          updatedAt: now
        };

        await client.botScenario.upsert({
          create: {
            ...scenarioPayload,
            id: scenarioId
          },
          update: scenarioPayload,
          where: { id: scenarioId }
        });

        if (mapped.status === "published") {
          const versionId = `${scenarioId}-v1`;
          await client.botScenarioVersion.upsert({
            create: {
              flowEdges: scenario.flowEdges ?? [],
              flowNodes: scenario.flowNodes ?? [],
              priority: Number(scenario.priority ?? index),
              scenarioId,
              sourceBindings: scenario.sourceBindings ?? [],
              status: "published",
              tenantId,
              triggerRules,
              versionId
            },
            update: {
              flowEdges: scenario.flowEdges ?? [],
              flowNodes: scenario.flowNodes ?? [],
              priority: Number(scenario.priority ?? index),
              sourceBindings: scenario.sourceBindings ?? [],
              status: "published",
              tenantId,
              triggerRules
            },
            where: { versionId }
          });
          await client.botScenario.update({
            data: { activeVersionId: versionId },
            where: { id: scenarioId }
          });
        }
      }
    }

    if (automationCatalog?.proactiveRules) {
      for (const rule of automationCatalog.proactiveRules) {
        const ruleId = `${rule.id}-${tenantId.replace(/^tenant-/, "")}`;
        await client.proactiveRule.upsert({
          create: {
            activeVariant: rule.activeVariant ?? "A",
            channels: rule.channels ?? [],
            cooldown: rule.cooldown ?? null,
            id: ruleId,
            segment: rule.segment ?? null,
            status: rule.status ?? "enabled",
            tenantId,
            updatedAt: now
          },
          update: {
            activeVariant: rule.activeVariant ?? "A",
            channels: rule.channels ?? [],
            cooldown: rule.cooldown ?? null,
            segment: rule.segment ?? null,
            status: rule.status ?? "enabled",
            tenantId,
            updatedAt: now
          },
          where: { id: ruleId }
        });
      }
    }

    if (qualityCatalog?.qualityMetrics) {
      for (const metric of qualityCatalog.qualityMetrics) {
        const ratingId = `${metric.id}-${tenantId.replace(/^tenant-/, "")}`;
        const auditId = `audit-${ratingId}`;
        const realtimeEventId = `rt-${ratingId}`;
        await client.qualityRating.upsert({
          create: {
            auditId,
            channel: metric.channel,
            clientId: metric.client ?? null,
            conversationId: metric.conversationId,
            createdAt: now,
            operator: metric.operator,
            ratingId,
            realtimeEventId,
            scale: metric.scale,
            score: Number(metric.score ?? 0),
            tenantId,
            topic: metric.topic ?? null
          },
          update: {
            channel: metric.channel,
            clientId: metric.client ?? null,
            conversationId: metric.conversationId,
            operator: metric.operator,
            scale: metric.scale,
            score: Number(metric.score ?? 0),
            topic: metric.topic ?? null
          },
          where: { tenantId_ratingId: { ratingId, tenantId } }
        });
      }
    }
  }

  process.stderr.write(`[bootstrap:local] Seeded automation and quality catalogs for ${tenantIds.join(", ")}.\n`);
}

function mapSeedBotScenarioStatus(seedStatus) {
  const raw = String(seedStatus ?? "").trim().toLowerCase();
  if (raw === "enabled" || raw === "published") {
    return { enabled: true, status: "published" };
  }
  if (raw === "disabled") {
    return { enabled: false, status: "disabled" };
  }
  if (raw === "archived") {
    return { enabled: false, status: "archived" };
  }
  return { enabled: false, status: "draft" };
}

function loadSeedCatalog(relativePath) {
  try {
    return require(relativePath);
  } catch (error) {
    process.stderr.write(
      `[bootstrap:local] Failed to load ${relativePath}: ${error instanceof Error ? error.message : String(error)}\n`
    );
    return null;
  }
}

async function upsertBootstrapTenant(client, slug) {
  const metadata = {
    slug,
    owner: "Local Client",
    ownerEmail: operatorEmail,
    planId: "local",
    region: "staging",
    domains: [`${slug}.example`],
    flags: [],
    incidentIds: [],
    notes: "Local stack tenant created by bootstrap:local."
  };

  await client.tenant.upsert({
    create: {
      healthScore: 100,
      id: BOOTSTRAP_TENANT_ID,
      metadata,
      name: "Local Client",
      status: "active"
    },
    update: {
      healthScore: 100,
      metadata,
      name: "Local Client",
      status: "active"
    },
    where: { id: BOOTSTRAP_TENANT_ID }
  });
}

async function upsertBootstrapOperator(client, email) {
  await client.tenantUser.upsert({
    create: {
      device: "Local bootstrap",
      email,
      id: BOOTSTRAP_OPERATOR_ID,
      inviteStatus: "accepted",
      lastActiveAt: null,
      metadata: { bootstrap: true },
      mfa: "disabled",
      name: "Local Operator",
      risk: "low",
      role: "Admin",
      sessions: 0,
      status: "active",
      supportNotes: "Created by bootstrap:local for the local stack.",
      tenantId: BOOTSTRAP_TENANT_ID
    },
    update: {
      device: "Local bootstrap",
      email,
      metadata: { bootstrap: true },
      mfa: "disabled",
      name: "Local Operator",
      role: "Admin",
      status: "active",
      supportNotes: "Created by bootstrap:local for the local stack.",
      tenantId: BOOTSTRAP_TENANT_ID
    },
    where: { id: BOOTSTRAP_OPERATOR_ID }
  });
}

async function upsertBootstrapPasswordCredential(client, email, password) {
  await client.passwordCredential.upsert({
    create: {
      algorithm: "scrypt",
      email,
      hash: hashPasswordCredential(password),
      subjectId: BOOTSTRAP_OPERATOR_ID,
      updatedAt: new Date(),
      version: 1
    },
    update: {
      algorithm: "scrypt",
      hash: hashPasswordCredential(password),
      subjectId: BOOTSTRAP_OPERATOR_ID,
      updatedAt: new Date(),
      version: 1
    },
    where: { email }
  });
}

async function upsertBootstrapPublicApiKey(client, input) {
  try {
    const now = new Date(input.createdAt);
    const secretHash = hashPublicApiKeySecret(input.rawSecret);

    await client.publicApiKey.upsert({
      create: {
        createdAt: now,
        environment: "stage",
        keyId: BOOTSTRAP_API_KEY_ID,
        keyPreview: input.keyPreview,
        name: "Local SDK stage key",
        owner: "Local bootstrap",
        scopes: ["clients:identify", "conversations:write"],
        secretHash,
        status: "active",
        tenantId: input.tenantId,
        updatedAt: now
      },
      update: {
        environment: "stage",
        keyPreview: input.keyPreview,
        name: "Local SDK stage key",
        owner: "Local bootstrap",
        scopes: ["clients:identify", "conversations:write"],
        secretHash,
        status: "active",
        tenantId: input.tenantId,
        updatedAt: now
      },
      where: { keyId: BOOTSTRAP_API_KEY_ID }
    });

    await client.publicApiKeyRevealState.upsert({
      create: {
        consumedAt: null,
        createdAt: now,
        keyId: BOOTSTRAP_API_KEY_ID,
        keyPreview: input.keyPreview,
        status: "available"
      },
      update: {
        consumedAt: null,
        keyPreview: input.keyPreview,
        status: "available"
      },
      where: { keyId: BOOTSTRAP_API_KEY_ID }
    });

    return true;
  } catch (error) {
    process.stderr.write(
      `[bootstrap:local] Prisma public API key persistence skipped: ${error instanceof Error ? error.message : String(error)}\n`
    );
    return false;
  }
}

function generateStagePublicApiKeySecret() {
  return `sk_test_local_${randomBytes(16).toString("hex")}`;
}

function hashPasswordCredential(password) {
  const cost = 16384;
  const blockSize = 8;
  const parallelization = 1;
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 32, {
    N: cost,
    maxmem: 64 * 1024 * 1024,
    p: parallelization,
    r: blockSize
  });
  return `scrypt:${cost}:${blockSize}:${parallelization}:${salt.toString("hex")}:${key.toString("hex")}`;
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
