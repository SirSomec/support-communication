import type { BotScenario } from "./automation.types.js";

/**
 * Development and contract-test data for the AI-bot foundation.
 *
 * This module is deliberately not imported by an application bootstrap.  The
 * AI connection, knowledge-source and agent-runtime repositories do not exist
 * yet, so loading these records into the ordinary automation store would make
 * a fixture look like an implemented feature.  Future repository seeders may
 * consume this catalog once their persistence contracts are in place.
 *
 * Credentials are represented only by an operational state.  No credential
 * value, key reference, token or password belongs in this file.
 */

export const aiBotFixtureTenants = [
  { id: "tenant-fixture-legacy", name: "Fixture Legacy Support" },
  { id: "tenant-fixture-ai", name: "Fixture Grounded AI Support" }
] as const;

export const legacyPublishedScenarioFixture: BotScenario = {
  activeVersionId: "bot-fixture-legacy-delivery:v1",
  channels: ["SDK"],
  createdAt: "2026-07-12T08:00:00.000Z",
  enabled: true,
  flowEdges: [{ from: "welcome", to: "handoff", label: "needs_operator" }],
  flowNodes: [
    { id: "welcome", type: "message", title: "Delivery status help" },
    { id: "handoff", type: "handoff", title: "Transfer to operator" }
  ],
  id: "bot-fixture-legacy-delivery",
  name: "Delivery status (legacy)",
  schemaVersion: "bot-flow/v1",
  status: "published",
  tenantId: "tenant-fixture-legacy",
  updatedAt: "2026-07-12T08:00:00.000Z"
};

export interface KnowledgeSourceFixture {
  id: string;
  kind: "document" | "url" | "mcp";
  readiness: "ready" | "not_ready";
  tenantId: string;
  title: string;
}

export const aiBotKnowledgeSourceFixtures: readonly KnowledgeSourceFixture[] = [
  {
    id: "source-fixture-ai-delivery-guide",
    kind: "document",
    readiness: "ready",
    tenantId: "tenant-fixture-ai",
    title: "Delivery consultation guide"
  },
  {
    id: "source-fixture-ai-returns-url",
    kind: "url",
    readiness: "not_ready",
    tenantId: "tenant-fixture-ai",
    title: "Returns policy website"
  }
];

export interface AiConnectionFixture {
  credentialState: "configured_externally" | "not_configured";
  id: string;
  model: string;
  provider: "openai_compatible";
  status: "ready" | "disabled";
  tenantId: string;
}

export const aiBotConnectionFixtures: readonly AiConnectionFixture[] = [
  {
    credentialState: "configured_externally",
    id: "connection-fixture-ai-primary",
    model: "consultation-model",
    provider: "openai_compatible",
    status: "ready",
    tenantId: "tenant-fixture-ai"
  },
  {
    credentialState: "not_configured",
    id: "connection-fixture-ai-disabled",
    model: "consultation-model",
    provider: "openai_compatible",
    status: "disabled",
    tenantId: "tenant-fixture-ai"
  }
];

/**
 * Declarative fixture only: it must not be passed to the existing bot runtime
 * until the agent policy and retrieval runtime are implemented.
 */
export const aiScenarioFixture = {
  channels: ["SDK"] as const,
  connectionId: "connection-fixture-ai-primary",
  id: "bot-fixture-ai-delivery-consultant",
  mode: "grounded_consultation" as const,
  name: "Delivery consultation (AI)",
  sourceIds: ["source-fixture-ai-delivery-guide"] as const,
  status: "draft" as const,
  tenantId: "tenant-fixture-ai"
};

export const aiBotFixtureCatalog = {
  aiScenario: aiScenarioFixture,
  connections: aiBotConnectionFixtures,
  legacyScenario: legacyPublishedScenarioFixture,
  sources: aiBotKnowledgeSourceFixtures,
  tenants: aiBotFixtureTenants
} as const;

