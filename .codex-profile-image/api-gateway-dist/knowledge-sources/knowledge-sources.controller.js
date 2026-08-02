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
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { TenantOperatorOrServiceAdminGuard } from "../conversation/tenant-operator-or-service-admin.guard.js";
import { RequireServiceAdminAction } from "../identity/service-admin-auth.js";
import { RequireTenantOperatorPermission } from "../identity/tenant-operator-auth.js";
import { KnowledgeSourcesService } from "./knowledge-sources.service.js";
let KnowledgeSourcesController = class KnowledgeSourcesController {
    service;
    constructor(service) {
        this.service = service;
    }
    list(request) { return this.service.list(tenantId(request)); }
    create(body, request) { return this.service.create(tenantId(request), body ?? {}); }
    // Статические сегменты «bulk/...» объявлены раньше «:sourceId», иначе «bulk» матчился бы как sourceId.
    bulkDisable(body, request) { return this.service.applyBulk(tenantId(request), "disable", body ?? {}); }
    bulkEnable(body, request) { return this.service.applyBulk(tenantId(request), "enable", body ?? {}); }
    bulkArchive(body, request) { return this.service.applyBulk(tenantId(request), "archive", body ?? {}); }
    bulkDelete(body, request) { return this.service.applyBulk(tenantId(request), "delete", body ?? {}); }
    disable(sourceId, request) { return this.service.disable(tenantId(request), sourceId); }
    refreshUrl(sourceId, request) { return this.service.refreshUrl(tenantId(request), sourceId); }
    refreshDocument(sourceId, request) { return this.service.refreshDocument(tenantId(request), sourceId); }
    enqueueAttachment(sourceId, body, request) { return this.service.enqueueAttachmentIngestion(tenantId(request), sourceId, body ?? {}); }
    update(sourceId, body, request) { return this.service.update(tenantId(request), sourceId, body ?? {}); }
    enable(sourceId, request) { return this.service.enable(tenantId(request), sourceId); }
    archive(sourceId, request) { return this.service.archive(tenantId(request), sourceId); }
    remove(sourceId, request) { return this.service.remove(tenantId(request), sourceId); }
    preview(sourceId, request) { return this.service.preview(tenantId(request), sourceId); }
};
__decorate([
    Get(),
    RequireTenantOperatorPermission("knowledge.read"),
    RequireServiceAdminAction("knowledge.read"),
    ApiOkResponse({ description: "Tenant-scoped knowledge source catalog" }),
    __param(0, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], KnowledgeSourcesController.prototype, "list", null);
__decorate([
    Post(),
    RequireTenantOperatorPermission("knowledge.write"),
    RequireServiceAdminAction("knowledge.write"),
    HttpCode(HttpStatus.OK),
    __param(0, Body()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], KnowledgeSourcesController.prototype, "create", null);
__decorate([
    Post("bulk/disable"),
    RequireTenantOperatorPermission("knowledge.write"),
    RequireServiceAdminAction("knowledge.write"),
    HttpCode(HttpStatus.OK),
    __param(0, Body()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], KnowledgeSourcesController.prototype, "bulkDisable", null);
__decorate([
    Post("bulk/enable"),
    RequireTenantOperatorPermission("knowledge.write"),
    RequireServiceAdminAction("knowledge.write"),
    HttpCode(HttpStatus.OK),
    __param(0, Body()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], KnowledgeSourcesController.prototype, "bulkEnable", null);
__decorate([
    Post("bulk/archive"),
    RequireTenantOperatorPermission("knowledge.write"),
    RequireServiceAdminAction("knowledge.write"),
    HttpCode(HttpStatus.OK),
    __param(0, Body()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], KnowledgeSourcesController.prototype, "bulkArchive", null);
__decorate([
    Post("bulk/delete"),
    RequireTenantOperatorPermission("knowledge.write"),
    RequireServiceAdminAction("knowledge.write"),
    HttpCode(HttpStatus.OK),
    __param(0, Body()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], KnowledgeSourcesController.prototype, "bulkDelete", null);
__decorate([
    Post(":sourceId/disable"),
    RequireTenantOperatorPermission("knowledge.write"),
    RequireServiceAdminAction("knowledge.write"),
    HttpCode(HttpStatus.OK),
    __param(0, Param("sourceId")),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], KnowledgeSourcesController.prototype, "disable", null);
__decorate([
    Post(":sourceId/refresh"),
    RequireTenantOperatorPermission("knowledge.write"),
    RequireServiceAdminAction("knowledge.write"),
    HttpCode(HttpStatus.OK),
    __param(0, Param("sourceId")),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], KnowledgeSourcesController.prototype, "refreshUrl", null);
__decorate([
    Post(":sourceId/refresh-document"),
    RequireTenantOperatorPermission("knowledge.write"),
    RequireServiceAdminAction("knowledge.write"),
    HttpCode(HttpStatus.OK),
    __param(0, Param("sourceId")),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], KnowledgeSourcesController.prototype, "refreshDocument", null);
__decorate([
    Post(":sourceId/attachments"),
    RequireTenantOperatorPermission("knowledge.write"),
    RequireServiceAdminAction("knowledge.write"),
    HttpCode(HttpStatus.OK),
    __param(0, Param("sourceId")),
    __param(1, Body()),
    __param(2, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], KnowledgeSourcesController.prototype, "enqueueAttachment", null);
__decorate([
    Patch(":sourceId"),
    RequireTenantOperatorPermission("knowledge.write"),
    RequireServiceAdminAction("knowledge.write"),
    HttpCode(HttpStatus.OK),
    __param(0, Param("sourceId")),
    __param(1, Body()),
    __param(2, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], KnowledgeSourcesController.prototype, "update", null);
__decorate([
    Post(":sourceId/enable"),
    RequireTenantOperatorPermission("knowledge.write"),
    RequireServiceAdminAction("knowledge.write"),
    HttpCode(HttpStatus.OK),
    __param(0, Param("sourceId")),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], KnowledgeSourcesController.prototype, "enable", null);
__decorate([
    Post(":sourceId/archive"),
    RequireTenantOperatorPermission("knowledge.write"),
    RequireServiceAdminAction("knowledge.write"),
    HttpCode(HttpStatus.OK),
    __param(0, Param("sourceId")),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], KnowledgeSourcesController.prototype, "archive", null);
__decorate([
    Delete(":sourceId"),
    RequireTenantOperatorPermission("knowledge.write"),
    RequireServiceAdminAction("knowledge.write"),
    HttpCode(HttpStatus.OK),
    __param(0, Param("sourceId")),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], KnowledgeSourcesController.prototype, "remove", null);
__decorate([
    Get(":sourceId/preview"),
    RequireTenantOperatorPermission("knowledge.read"),
    RequireServiceAdminAction("knowledge.read"),
    __param(0, Param("sourceId")),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], KnowledgeSourcesController.prototype, "preview", null);
KnowledgeSourcesController = __decorate([
    ApiTags("knowledge-sources"),
    UseGuards(TenantOperatorOrServiceAdminGuard),
    Controller("knowledge-sources"),
    __metadata("design:paramtypes", [KnowledgeSourcesService])
], KnowledgeSourcesController);
export { KnowledgeSourcesController };
function tenantId(request) {
    return request.tenantOperatorContext?.tenantId ?? request.serviceAdminContext?.currentTenantId ?? "";
}
//# sourceMappingURL=knowledge-sources.controller.js.map