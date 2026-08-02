import { type BackendEnvelope } from "@support-communication/envelope";
import { IdentityRepository } from "../identity/identity.repository.js";
import { type OpenAiCompatibleChatConnection, type OpenAiCompatibleChatProvider } from "./openai-compatible-chat.provider.js";
import { AiConnectionRepository, type AiConnectionCapability } from "./ai-connection.repository.js";
import { AiUsageRepository } from "./ai-usage.repository.js";
export interface AiConnectionWriteInput {
    baseUrl?: string;
    capabilities?: AiConnectionCapability[];
    chatModel?: string;
    embeddingModel?: string | null;
    limits?: {
        maxConcurrentRuns?: number;
        monthlyTokenBudget?: number;
        requestsPerMinute?: number;
        sandboxMonthlyTokenBudget?: number;
    };
    retrievalModel?: string | null;
    secret?: string;
}
export type AiConnectionTestProviderFactory = (connection: OpenAiCompatibleChatConnection) => OpenAiCompatibleChatProvider;
export declare class AiConnectionsService {
    private readonly repository;
    private readonly environment;
    private readonly usage;
    private readonly identityRepository;
    private readonly testProviderFactory;
    constructor(repository?: AiConnectionRepository, environment?: NodeJS.ProcessEnv, usage?: AiUsageRepository, identityRepository?: IdentityRepository, testProviderFactory?: AiConnectionTestProviderFactory);
    list(tenantId: string): Promise<BackendEnvelope<Record<string, unknown>>>;
    create(tenantId: string, input: AiConnectionWriteInput): Promise<BackendEnvelope<Record<string, unknown>>>;
    update(tenantId: string, connectionId: string, input: AiConnectionWriteInput): Promise<BackendEnvelope<Record<string, unknown>>>;
    rotate(tenantId: string, connectionId: string, input: Pick<AiConnectionWriteInput, "secret">): Promise<BackendEnvelope<Record<string, unknown>>>;
    test(tenantId: string, connectionId: string): Promise<BackendEnvelope<Record<string, unknown>>>;
    disable(tenantId: string, connectionId: string): Promise<BackendEnvelope<Record<string, unknown>>>;
    remove(tenantId: string, connectionId: string): Promise<BackendEnvelope<Record<string, unknown>>>;
    private secretStore;
    private recordAudit;
}
