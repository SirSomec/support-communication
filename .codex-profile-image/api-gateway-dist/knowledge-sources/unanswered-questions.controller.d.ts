import { type BackendEnvelope } from "@support-communication/envelope";
import { type ServiceAdminRequest } from "../identity/service-admin-auth.js";
import { type TenantOperatorRequest } from "../identity/tenant-operator-auth.js";
/** BAI-826: вопросы, на которые бот не нашёл знаний, — сырьё для новых статей. */
export declare class UnansweredQuestionsController {
    private get repository();
    list(request: TenantOperatorRequest & ServiceAdminRequest): Promise<BackendEnvelope<Record<string, unknown>>>;
    dismiss(questionId: string, request: TenantOperatorRequest & ServiceAdminRequest): Promise<BackendEnvelope<Record<string, unknown>>>;
    resolve(questionId: string, body: {
        articleId?: string;
    } | null, request: TenantOperatorRequest & ServiceAdminRequest): Promise<BackendEnvelope<Record<string, unknown>>>;
}
