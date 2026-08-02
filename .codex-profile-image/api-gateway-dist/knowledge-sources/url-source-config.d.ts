/**
 * Pure validation for remotely fetched knowledge sources.  Resolution and
 * fetching must perform their own DNS/IP checks as well; this module only
 * rejects unsafe URL literals before a source is persisted.
 */
export declare const DEFAULT_URL_SOURCE_MAX_NORMALIZED_LENGTH = 2048;
export interface UrlKnowledgeSourceConfig {
    url: string;
}
export interface UrlSourceValidationOptions {
    /** When supplied, only these canonical host names may be used. */
    allowedHosts?: readonly string[];
    maxNormalizedLength?: number;
}
export type UrlSourceValidationCode = "url_source_config_invalid" | "url_source_https_required" | "url_source_credentials_forbidden" | "url_source_host_forbidden" | "url_source_host_not_allowed" | "url_source_too_long";
export type UrlSourceConfigValidation = {
    ok: true;
    config: UrlKnowledgeSourceConfig;
    hostname: string;
} | {
    ok: false;
    code: UrlSourceValidationCode;
};
export declare function validateUrlKnowledgeSourceConfig(input: unknown, options?: UrlSourceValidationOptions): UrlSourceConfigValidation;
