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
export declare const aiBotFixtureTenants: readonly [{
    readonly id: "tenant-fixture-legacy";
    readonly name: "Fixture Legacy Support";
}, {
    readonly id: "tenant-fixture-ai";
    readonly name: "Fixture Grounded AI Support";
}];
export declare const legacyPublishedScenarioFixture: BotScenario;
export interface KnowledgeSourceFixture {
    id: string;
    kind: "document" | "url" | "mcp";
    readiness: "ready" | "not_ready";
    tenantId: string;
    title: string;
}
export declare const aiBotKnowledgeSourceFixtures: readonly KnowledgeSourceFixture[];
export interface AiConnectionFixture {
    credentialState: "configured_externally" | "not_configured";
    id: string;
    model: string;
    provider: "openai_compatible";
    status: "ready" | "disabled";
    tenantId: string;
}
export declare const aiBotConnectionFixtures: readonly AiConnectionFixture[];
/**
 * Declarative fixture only: it must not be passed to the existing bot runtime
 * until the agent policy and retrieval runtime are implemented.
 */
export declare const aiScenarioFixture: {
    channels: readonly ["SDK"];
    connectionId: string;
    id: string;
    mode: "grounded_consultation";
    name: string;
    sourceIds: readonly ["source-fixture-ai-delivery-guide"];
    status: "draft";
    tenantId: string;
};
export declare const aiBotFixtureCatalog: {
    readonly aiScenario: {
        channels: readonly ["SDK"];
        connectionId: string;
        id: string;
        mode: "grounded_consultation";
        name: string;
        sourceIds: readonly ["source-fixture-ai-delivery-guide"];
        status: "draft";
        tenantId: string;
    };
    readonly connections: readonly AiConnectionFixture[];
    readonly legacyScenario: BotScenario;
    readonly sources: readonly KnowledgeSourceFixture[];
    readonly tenants: readonly [{
        readonly id: "tenant-fixture-legacy";
        readonly name: "Fixture Legacy Support";
    }, {
        readonly id: "tenant-fixture-ai";
        readonly name: "Fixture Grounded AI Support";
    }];
};
