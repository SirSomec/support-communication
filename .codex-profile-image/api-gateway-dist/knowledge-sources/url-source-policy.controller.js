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
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Put, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { RequireServiceAdminAction } from "../identity/service-admin-auth.js";
import { ServiceAdminSessionGuard } from "../identity/service-admin-session.guard.js";
import { KnowledgeSourcesService } from "./knowledge-sources.service.js";
let UrlSourcePolicyController = class UrlSourcePolicyController {
    service;
    constructor(service) {
        this.service = service;
    }
    get(tenantId) { return this.service.getUrlPolicy(tenantId); }
    set(tenantId, body) { return this.service.setUrlPolicy(tenantId, body ?? {}); }
};
__decorate([
    Get(),
    RequireServiceAdminAction("knowledge.write"),
    ApiOkResponse({ description: "Tenant URL source allowlist policy" }),
    __param(0, Param("tenantId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], UrlSourcePolicyController.prototype, "get", null);
__decorate([
    Put(),
    RequireServiceAdminAction("knowledge.write"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Set exact-host URL source allowlist; null allows any safe public HTTPS host" }),
    __param(0, Param("tenantId")),
    __param(1, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], UrlSourcePolicyController.prototype, "set", null);
UrlSourcePolicyController = __decorate([
    ApiTags("service-admin", "knowledge-sources"),
    UseGuards(ServiceAdminSessionGuard),
    Controller("service-admin/tenants/:tenantId/knowledge-source-url-policy"),
    __metadata("design:paramtypes", [KnowledgeSourcesService])
], UrlSourcePolicyController);
export { UrlSourcePolicyController };
//# sourceMappingURL=url-source-policy.controller.js.map