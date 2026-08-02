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
import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { ServiceAdminSessionGuard } from "../identity/service-admin-session.guard.js";
import { RequireServiceAdminAction } from "../identity/service-admin-auth.js";
import { FeatureFlagService } from "./feature-flag.service.js";
let FeatureFlagController = class FeatureFlagController {
    featureFlagService;
    constructor(featureFlagService) {
        this.featureFlagService = featureFlagService;
    }
    fetchFeatureFlags(filters) {
        return this.featureFlagService.fetchFeatureFlags(filters);
    }
    previewFlagChange(flagId, payload) {
        return this.featureFlagService.previewFlagChange({ ...payload, flagId });
    }
    updateFeatureFlag(flagId, payload, idempotencyKey, request) {
        return this.featureFlagService.updateFeatureFlag({
            ...payload,
            actor: request.serviceAdminContext?.actor,
            flagId,
            idempotencyKey: idempotencyKey ?? payload.idempotencyKey
        });
    }
    runInternalFlagTest(flagId, payload) {
        return this.featureFlagService.runInternalFlagTest({ ...payload, flagId });
    }
};
__decorate([
    Get(),
    RequireServiceAdminAction("flags.read"),
    ApiOkResponse({ description: "Feature flag list envelope" }),
    __param(0, Query()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], FeatureFlagController.prototype, "fetchFeatureFlags", null);
__decorate([
    Post(":flagId/preview"),
    RequireServiceAdminAction("flags.manage"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Feature flag rollout preview envelope" }),
    __param(0, Param("flagId")),
    __param(1, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], FeatureFlagController.prototype, "previewFlagChange", null);
__decorate([
    Patch(":flagId"),
    RequireServiceAdminAction("flags.manage"),
    ApiOkResponse({ description: "Audited feature flag update envelope" }),
    __param(0, Param("flagId")),
    __param(1, Body()),
    __param(2, Headers("idempotency-key")),
    __param(3, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], FeatureFlagController.prototype, "updateFeatureFlag", null);
__decorate([
    Post(":flagId/internal-tests"),
    RequireServiceAdminAction("flags.test"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Feature flag internal evaluation test envelope" }),
    __param(0, Param("flagId")),
    __param(1, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], FeatureFlagController.prototype, "runInternalFlagTest", null);
FeatureFlagController = __decorate([
    ApiTags("feature-flags"),
    UseGuards(ServiceAdminSessionGuard),
    Controller("feature-flags"),
    __metadata("design:paramtypes", [FeatureFlagService])
], FeatureFlagController);
export { FeatureFlagController };
//# sourceMappingURL=feature-flag.controller.js.map