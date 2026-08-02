import { PublicDemoRequestService, type PublicDemoRequestPayload } from "./public-demo-request.service.js";
interface PublicDemoRequestHttpRequest {
    headers?: Record<string, string | string[] | undefined>;
    ip?: string;
    socket?: {
        remoteAddress?: string;
    };
}
export declare class PublicDemoRequestController {
    private readonly publicDemoRequestService;
    constructor(publicDemoRequestService: PublicDemoRequestService);
    createDemoRequest(payload: PublicDemoRequestPayload | undefined, idempotencyKey: string | undefined, userAgent: string | undefined, request: PublicDemoRequestHttpRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
}
export {};
