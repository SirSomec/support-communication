interface TraceableRequest {
    headers: Record<string, string | string[] | undefined>;
    method?: string;
    originalUrl?: string;
    traceId?: string;
}
interface TraceableResponse {
    setHeader(name: string, value: string): void;
}
export declare function requestTraceMiddleware(request: TraceableRequest, response: TraceableResponse, next: () => void): void;
export {};
