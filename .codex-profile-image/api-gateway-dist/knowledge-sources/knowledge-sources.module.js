var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Module } from "@nestjs/common";
import { TenantOperatorOrServiceAdminGuard } from "../conversation/tenant-operator-or-service-admin.guard.js";
import { KnowledgeSourcesController } from "./knowledge-sources.controller.js";
import { KnowledgeSourcesService } from "./knowledge-sources.service.js";
import { ServiceAdminSessionGuard } from "../identity/service-admin-session.guard.js";
import { UrlSourcePolicyController } from "./url-source-policy.controller.js";
import { KnowledgeRetrievalApiService } from "./knowledge-retrieval-api.service.js";
import { KnowledgeRetrievalController } from "./knowledge-retrieval.controller.js";
import { McpConnectorsController } from "./mcp-connectors.controller.js";
import { UnansweredQuestionsController } from "./unanswered-questions.controller.js";
import { TenantMcpConnectorsController } from "./tenant-mcp-connectors.controller.js";
import { McpConnectorsService } from "./mcp-connectors.service.js";
import { McpConnectorRepository } from "./mcp-connector.repository.js";
import { HttpMcpReadOnlyTransport, McpReadOnlyConnectorService } from "./mcp-readonly-connector.service.js";
const persistedMcpRuntimeProvider = { provide: McpReadOnlyConnectorService, useFactory: () => new McpReadOnlyConnectorService(new HttpMcpReadOnlyTransport(), 8_000, McpConnectorRepository.default()) };
let KnowledgeSourcesModule = class KnowledgeSourcesModule {
};
KnowledgeSourcesModule = __decorate([
    Module({ controllers: [KnowledgeSourcesController, UrlSourcePolicyController, KnowledgeRetrievalController, McpConnectorsController, TenantMcpConnectorsController, UnansweredQuestionsController], providers: [KnowledgeSourcesService, KnowledgeRetrievalApiService, McpConnectorsService, persistedMcpRuntimeProvider, TenantOperatorOrServiceAdminGuard, ServiceAdminSessionGuard], exports: [KnowledgeSourcesService, KnowledgeRetrievalApiService, McpConnectorsService, McpReadOnlyConnectorService] })
], KnowledgeSourcesModule);
export { KnowledgeSourcesModule };
//# sourceMappingURL=knowledge-sources.module.js.map