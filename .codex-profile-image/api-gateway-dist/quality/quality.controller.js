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
import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { TenantOperatorOrServiceAdminGuard } from "../conversation/tenant-operator-or-service-admin.guard.js";
import { RequireServiceAdminAction } from "../identity/service-admin-auth.js";
import { RequireTenantOperatorPermission } from "../identity/tenant-operator-auth.js";
import { QualityService } from "./quality.service.js";
let QualityController = class QualityController {
    qualityService;
    constructor(qualityService) {
        this.qualityService = qualityService;
    }
    fetchQualityWorkspace(request) {
        return this.qualityService.fetchQualityWorkspace(qualityContextFromRequest(request));
    }
    scoreDraftResponse(payload, request) {
        return this.qualityService.scoreDraftResponse(payload, qualityContextFromRequest(request));
    }
    scoreDraftResponseAlias(payload, request) {
        return this.qualityService.scoreDraftResponse(payload, qualityContextFromRequest(request));
    }
    recordClientQualityRating(payload, request) {
        return this.qualityService.recordClientQualityRating(payload, qualityContextFromRequest(request));
    }
    recordManualQaReview(payload, request) {
        return this.qualityService.recordManualQaReview(payload, qualityContextFromRequest(request));
    }
    recordAiSuggestionDecision(payload, request) {
        return this.qualityService.recordAiSuggestionDecision(payload, qualityContextFromRequest(request));
    }
};
__decorate([
    Get("workspace"),
    RequireTenantOperatorPermission("quality.read"),
    RequireServiceAdminAction("quality.read"),
    ApiOkResponse({ description: "Quality, AI scoring and coaching workspace envelope" }),
    __param(0, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], QualityController.prototype, "fetchQualityWorkspace", null);
__decorate([
    Post("draft-score"),
    RequireTenantOperatorPermission("quality.scoring-audits.write"),
    RequireServiceAdminAction("quality.scoring-audits.write"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Pre-send quality scoring envelope" }),
    __param(0, Body()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], QualityController.prototype, "scoreDraftResponse", null);
__decorate([
    Post("draft-scores"),
    RequireTenantOperatorPermission("quality.scoring-audits.write"),
    RequireServiceAdminAction("quality.scoring-audits.write"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Pre-send quality scoring envelope" }),
    __param(0, Body()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], QualityController.prototype, "scoreDraftResponseAlias", null);
__decorate([
    Post("ratings"),
    RequireTenantOperatorPermission("quality.ratings.write"),
    RequireServiceAdminAction("quality.ratings.write"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Client quality rating envelope" }),
    __param(0, Body()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], QualityController.prototype, "recordClientQualityRating", null);
__decorate([
    Post("manual-reviews"),
    RequireTenantOperatorPermission("quality.manual-reviews.write"),
    RequireServiceAdminAction("quality.manual-reviews.write"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Manual QA review envelope" }),
    __param(0, Body()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], QualityController.prototype, "recordManualQaReview", null);
__decorate([
    Post("ai-suggestion-decisions"),
    RequireTenantOperatorPermission("quality.scoring-audits.write"),
    RequireServiceAdminAction("quality.scoring-audits.write"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Durable operator decision for an AI suggestion" }),
    __param(0, Body()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], QualityController.prototype, "recordAiSuggestionDecision", null);
QualityController = __decorate([
    ApiTags("quality"),
    UseGuards(TenantOperatorOrServiceAdminGuard),
    Controller("quality"),
    __metadata("design:paramtypes", [QualityService])
], QualityController);
export { QualityController };
function qualityContextFromRequest(request) {
    const serviceAdminContext = request.serviceAdminContext;
    const tenantId = request.tenantOperatorContext?.tenantId ?? serviceAdminContext?.currentTenantId;
    if (!tenantId)
        return {};
    if (request.tenantOperatorContext) {
        return {
            actorId: request.tenantOperatorContext.userId,
            actorType: "operator",
            tenantId
        };
    }
    return {
        actorId: serviceAdminContext?.actor.id,
        actorName: serviceAdminContext?.actor.name,
        actorType: "service_admin",
        tenantId
    };
}
//# sourceMappingURL=quality.controller.js.map