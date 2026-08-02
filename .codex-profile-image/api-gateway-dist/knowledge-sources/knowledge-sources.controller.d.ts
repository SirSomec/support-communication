import { type ServiceAdminRequest } from "../identity/service-admin-auth.js";
import { type TenantOperatorRequest } from "../identity/tenant-operator-auth.js";
import { KnowledgeSourcesService, type KnowledgeSourceCreateInput } from "./knowledge-sources.service.js";
export declare class KnowledgeSourcesController {
    private readonly service;
    constructor(service: KnowledgeSourcesService);
    list(request: TenantOperatorRequest & ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    create(body: KnowledgeSourceCreateInput, request: TenantOperatorRequest & ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    bulkDisable(body: {
        sourceIds?: string[];
    }, request: TenantOperatorRequest & ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    bulkEnable(body: {
        sourceIds?: string[];
    }, request: TenantOperatorRequest & ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    bulkArchive(body: {
        sourceIds?: string[];
    }, request: TenantOperatorRequest & ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    bulkDelete(body: {
        sourceIds?: string[];
    }, request: TenantOperatorRequest & ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    disable(sourceId: string, request: TenantOperatorRequest & ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    refreshUrl(sourceId: string, request: TenantOperatorRequest & ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    refreshDocument(sourceId: string, request: TenantOperatorRequest & ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    enqueueAttachment(sourceId: string, body: {
        fileId?: string;
        idempotencyKey?: string;
    }, request: TenantOperatorRequest & ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    update(sourceId: string, body: {
        title?: string;
    }, request: TenantOperatorRequest & ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    enable(sourceId: string, request: TenantOperatorRequest & ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    archive(sourceId: string, request: TenantOperatorRequest & ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    remove(sourceId: string, request: TenantOperatorRequest & ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    preview(sourceId: string, request: TenantOperatorRequest & ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
}
