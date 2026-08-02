var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { TenantOperatorOrServiceAdminGuard } from "../conversation/tenant-operator-or-service-admin.guard.js";
import { RequireServiceAdminAction } from "../identity/service-admin-auth.js";
import { RequireTenantOperatorPermission } from "../identity/tenant-operator-auth.js";
import { KnowledgeRetrievalApiService } from "./knowledge-retrieval-api.service.js";
let KnowledgeRetrievalController = class KnowledgeRetrievalController {
    service;
    constructor(service) {
        this.service = service;
    }
    retrieve(body, request) { return this.service.retrieveScenario({ ...(body ?? {}), tenantId: request.tenantOperatorContext?.tenantId ?? request.serviceAdminContext?.currentTenantId ?? "" }); }
};
__decorate([
    Post("query"),
    HttpCode(HttpStatus.OK),
    RequireTenantOperatorPermission("knowledge.read"),
    RequireServiceAdminAction("knowledge.read"),
    ApiOkResponse({ description: "Tenant- and scenario-bound passages with versioned offset citations and token budget" }),
    __param(0, Body()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], KnowledgeRetrievalController.prototype, "retrieve", null);
KnowledgeRetrievalController = __decorate([
    ApiTags("knowledge-retrieval"),
    UseGuards(TenantOperatorOrServiceAdminGuard),
    Controller("knowledge-retrieval"),
    __metadata("design:paramtypes", [KnowledgeRetrievalApiService])
], KnowledgeRetrievalController);
export { KnowledgeRetrievalController };
//# sourceMappingURL=knowledge-retrieval.controller.js.map