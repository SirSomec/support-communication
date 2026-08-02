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
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { TenantOperatorOrServiceAdminGuard } from "../conversation/tenant-operator-or-service-admin.guard.js";
import { RequireServiceAdminAction } from "../identity/service-admin-auth.js";
import { RequireTenantOperatorPermission } from "../identity/tenant-operator-auth.js";
import { WorkspaceService } from "./workspace.service.js";
let KnowledgeController = class KnowledgeController {
    workspaceService;
    constructor(workspaceService) {
        this.workspaceService = workspaceService;
    }
    createKnowledgeArticle(payload, request) {
        return this.workspaceService.createKnowledgeArticle(payload, tenantContextFromRequest(request));
    }
    fetchKnowledgeArticles(filters, request) {
        return this.workspaceService.fetchKnowledgeArticles(filters, tenantContextFromRequest(request));
    }
    fetchKnowledgeArticle(articleId, request) {
        return this.workspaceService.fetchKnowledgeArticle(articleId, tenantContextFromRequest(request));
    }
    saveKnowledgeArticleDraft(articleId, payload, request) {
        return this.workspaceService.saveKnowledgeArticleDraft({ ...payload, articleId }, tenantContextFromRequest(request));
    }
    submitKnowledgeArticleForReview(articleId, payload, request) {
        return this.workspaceService.submitKnowledgeArticleForReview({ ...payload, articleId }, tenantContextFromRequest(request));
    }
    approveKnowledgeArticle(articleId, payload, request) {
        return this.workspaceService.approveKnowledgeArticle({ ...payload, articleId }, tenantContextFromRequest(request));
    }
    publishKnowledgeArticle(articleId, payload, request) {
        return this.workspaceService.publishKnowledgeArticle({ ...payload, articleId }, tenantContextFromRequest(request));
    }
    rejectKnowledgeArticle(articleId, payload, request) {
        return this.workspaceService.rejectKnowledgeArticle({ ...payload, articleId }, tenantContextFromRequest(request));
    }
    archiveKnowledgeArticle(articleId, payload, request) {
        return this.workspaceService.archiveKnowledgeArticle({ ...payload, articleId }, tenantContextFromRequest(request));
    }
    addKnowledgeArticleAttachment(articleId, payload, request) {
        return this.workspaceService.addKnowledgeArticleAttachment({ actor: payload.actor, articleId, attachment: payload.attachment ?? {}, reason: payload.reason }, tenantContextFromRequest(request));
    }
    deleteKnowledgeArticleAttachment(articleId, attachmentId, payload, request) {
        return this.workspaceService.deleteKnowledgeArticleAttachment({ ...payload, articleId, attachmentId }, tenantContextFromRequest(request));
    }
};
__decorate([
    Post(),
    RequireTenantOperatorPermission("knowledge.write"),
    RequireServiceAdminAction("knowledge.write"),
    HttpCode(HttpStatus.OK),
    __param(0, Body()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], KnowledgeController.prototype, "createKnowledgeArticle", null);
__decorate([
    Get(),
    RequireTenantOperatorPermission("knowledge.read"),
    RequireServiceAdminAction("knowledge.read"),
    ApiOkResponse({ description: "Knowledge article list envelope" }),
    __param(0, Query()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], KnowledgeController.prototype, "fetchKnowledgeArticles", null);
__decorate([
    Get(":articleId"),
    RequireTenantOperatorPermission("knowledge.read"),
    RequireServiceAdminAction("knowledge.read"),
    ApiOkResponse({ description: "Knowledge article detail envelope with versions and approval history" }),
    __param(0, Param("articleId")),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], KnowledgeController.prototype, "fetchKnowledgeArticle", null);
__decorate([
    Post(":articleId/drafts"),
    RequireTenantOperatorPermission("knowledge.write"),
    RequireServiceAdminAction("knowledge.write"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Knowledge article draft envelope with version audit" }),
    __param(0, Param("articleId")),
    __param(1, Body()),
    __param(2, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], KnowledgeController.prototype, "saveKnowledgeArticleDraft", null);
__decorate([
    Post(":articleId/submit-review"),
    RequireTenantOperatorPermission("knowledge.write"),
    RequireServiceAdminAction("knowledge.write"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Knowledge article review submission envelope" }),
    __param(0, Param("articleId")),
    __param(1, Body()),
    __param(2, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], KnowledgeController.prototype, "submitKnowledgeArticleForReview", null);
__decorate([
    Post(":articleId/approve"),
    RequireTenantOperatorPermission("knowledge.write"),
    RequireServiceAdminAction("knowledge.write"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Knowledge article approval envelope" }),
    __param(0, Param("articleId")),
    __param(1, Body()),
    __param(2, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], KnowledgeController.prototype, "approveKnowledgeArticle", null);
__decorate([
    Post(":articleId/publish"),
    RequireTenantOperatorPermission("knowledge.write"),
    RequireServiceAdminAction("knowledge.write"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Knowledge article publication envelope" }),
    __param(0, Param("articleId")),
    __param(1, Body()),
    __param(2, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], KnowledgeController.prototype, "publishKnowledgeArticle", null);
__decorate([
    Post(":articleId/reject"),
    RequireTenantOperatorPermission("knowledge.write"),
    RequireServiceAdminAction("knowledge.write"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Knowledge article rejection envelope" }),
    __param(0, Param("articleId")),
    __param(1, Body()),
    __param(2, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], KnowledgeController.prototype, "rejectKnowledgeArticle", null);
__decorate([
    Post(":articleId/archive"),
    RequireTenantOperatorPermission("knowledge.write"),
    RequireServiceAdminAction("knowledge.write"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Knowledge article archive envelope" }),
    __param(0, Param("articleId")),
    __param(1, Body()),
    __param(2, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], KnowledgeController.prototype, "archiveKnowledgeArticle", null);
__decorate([
    Post(":articleId/attachments"),
    RequireTenantOperatorPermission("knowledge.write"),
    RequireServiceAdminAction("knowledge.write"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Knowledge article attachment descriptor envelope" }),
    __param(0, Param("articleId")),
    __param(1, Body()),
    __param(2, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], KnowledgeController.prototype, "addKnowledgeArticleAttachment", null);
__decorate([
    Delete(":articleId/attachments/:attachmentId"),
    RequireTenantOperatorPermission("knowledge.write"),
    RequireServiceAdminAction("knowledge.write"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Knowledge article attachment delete envelope" }),
    __param(0, Param("articleId")),
    __param(1, Param("attachmentId")),
    __param(2, Body()),
    __param(3, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object]),
    __metadata("design:returntype", Promise)
], KnowledgeController.prototype, "deleteKnowledgeArticleAttachment", null);
KnowledgeController = __decorate([
    ApiTags("knowledge"),
    UseGuards(TenantOperatorOrServiceAdminGuard),
    Controller("knowledge"),
    __metadata("design:paramtypes", [WorkspaceService])
], KnowledgeController);
export { KnowledgeController };
function tenantContextFromRequest(request) {
    if (request.tenantOperatorContext?.tenantId) {
        return { tenantId: request.tenantOperatorContext.tenantId };
    }
    return request.serviceAdminContext?.currentTenantId ? { tenantId: request.serviceAdminContext.currentTenantId } : {};
}
//# sourceMappingURL=knowledge.controller.js.map