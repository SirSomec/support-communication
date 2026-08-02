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
import { Body, Controller, Get, HttpCode, HttpStatus, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { TenantOperatorOrServiceAdminGuard } from "../conversation/tenant-operator-or-service-admin.guard.js";
import { RequireServiceAdminAction } from "../identity/service-admin-auth.js";
import { RequireTenantOperatorPermission } from "../identity/tenant-operator-auth.js";
import { OperatorPresenceService } from "./presence.service.js";
let PresenceController = class PresenceController {
    presenceService;
    constructor(presenceService) {
        this.presenceService = presenceService;
    }
    fetchMyPresence(request) {
        return this.presenceService.fetchMyPresence(presenceContextFromRequest(request));
    }
    setMyPresence(payload, request) {
        return this.presenceService.setMyPresence(payload, presenceContextFromRequest(request));
    }
    disconnectMyPresence(request) {
        return this.presenceService.markMyPresenceUnavailableIfOnline(presenceContextFromRequest(request));
    }
    fetchTeamPresence(filters, request) {
        return this.presenceService.fetchTeamPresence(filters, presenceContextFromRequest(request));
    }
};
__decorate([
    Get("me"),
    RequireTenantOperatorPermission("presence.write"),
    RequireServiceAdminAction("presence.write"),
    ApiOkResponse({ description: "Current operator presence status and status catalog envelope" }),
    __param(0, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], PresenceController.prototype, "fetchMyPresence", null);
__decorate([
    Put("me"),
    RequireTenantOperatorPermission("presence.write"),
    RequireServiceAdminAction("presence.write"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Operator presence transition envelope with realtime event descriptor" }),
    __param(0, Body()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], PresenceController.prototype, "setMyPresence", null);
__decorate([
    Post("me/disconnect"),
    RequireTenantOperatorPermission("presence.write"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Marks the current operator unavailable only when their current status is online" }),
    __param(0, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], PresenceController.prototype, "disconnectMyPresence", null);
__decorate([
    Get("team"),
    RequireTenantOperatorPermission("presence.read"),
    RequireServiceAdminAction("presence.read"),
    ApiOkResponse({ description: "Team presence statuses with time-in-status totals envelope" }),
    __param(0, Query()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], PresenceController.prototype, "fetchTeamPresence", null);
PresenceController = __decorate([
    ApiTags("presence"),
    UseGuards(TenantOperatorOrServiceAdminGuard),
    Controller("presence"),
    __metadata("design:paramtypes", [OperatorPresenceService])
], PresenceController);
export { PresenceController };
function presenceContextFromRequest(request) {
    if (request.tenantOperatorContext) {
        return {
            actorId: request.tenantOperatorContext.userId,
            actorType: "operator",
            tenantId: request.tenantOperatorContext.tenantId
        };
    }
    const tenantId = request.serviceAdminContext?.currentTenantId;
    if (!tenantId) {
        return {};
    }
    return {
        actorId: request.serviceAdminContext?.actor.id,
        actorName: request.serviceAdminContext?.actor.name,
        actorType: "service_admin",
        tenantId
    };
}
//# sourceMappingURL=presence.controller.js.map