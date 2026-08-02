import { type QualityScoringProvider } from "./quality-scoring.provider.js";
export declare const OPENAI_COMPATIBLE_QUALITY_PROVIDER_ID: "openai-compatible-quality-scoring";
export interface OpenAiCompatibleQualityProviderConfig {
    apiKey: string;
    baseUrl: string;
    maxRetries?: number;
    model: string;
    rateLimitPerMinute?: number;
    timeoutMs?: number;
}
export interface OpenAiCompatibleQualityProviderOptions {
    fetch?: typeof fetch;
    now?: () => number;
    sleep?: (milliseconds: number) => Promise<void>;
}
export interface QualityAiProviderEnvironment {
    QUALITY_AI_API_KEY?: string;
    QUALITY_AI_BASE_URL?: string;
    QUALITY_AI_ENABLED?: string;
    QUALITY_AI_MAX_RETRIES?: string;
    QUALITY_AI_MODEL?: string;
    QUALITY_AI_RATE_LIMIT_PER_MINUTE?: string;
    QUALITY_AI_TIMEOUT_MS?: string;
}
export interface QualityAiProviderConfiguration {
    configured: boolean;
    model: string | null;
    provider: QualityScoringProvider | null;
    providerId: string | null;
    reason: "disabled" | "missing_api_key" | "missing_base_url" | "missing_model" | null;
}
export declare function configureOpenAiCompatibleQualityProvider(source?: QualityAiProviderEnvironment, options?: OpenAiCompatibleQualityProviderOptions): QualityAiProviderConfiguration;
export declare function createOpenAiCompatibleQualityScoringProvider(config: OpenAiCompatibleQualityProviderConfig, options?: OpenAiCompatibleQualityProviderOptions): QualityScoringProvider;
export declare function redactQualityDraftText(text: string): string;
