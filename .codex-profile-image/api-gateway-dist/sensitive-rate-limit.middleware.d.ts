interface RateLimitPolicy {
    accountLimit: number;
    ipLimit: number;
    name: string;
    path: RegExp;
    windowSeconds: number;
}
interface RateLimitRequest {
    body?: {
        email?: unknown;
    };
    headers: Record<string, string | string[] | undefined>;
    method?: string;
    originalUrl?: string;
    socket?: {
        remoteAddress?: string;
    };
}
interface RateLimitResponse {
    end(body?: string): void;
    setHeader(name: string, value: string): void;
    statusCode: number;
}
export declare function sensitiveRateLimitMiddleware(request: RateLimitRequest, response: RateLimitResponse, next: () => void): Promise<void>;
export declare function selectSensitiveRateLimitPolicy(method: string | undefined, originalUrl: string | undefined): RateLimitPolicy | undefined;
export declare function resolveClientAddress(request: RateLimitRequest): string;
export declare function rateLimitKey(policy: string, dimension: "account" | "ip", value: string): string;
export {};
