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
import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { TenantOperatorOrServiceAdminGuard } from "../conversation/tenant-operator-or-service-admin.guard.js";
import { RequireServiceAdminAction } from "../identity/service-admin-auth.js";
import { RequireTenantOperatorPermission } from "../identity/tenant-operator-auth.js";
import { RoutingService } from "./routing.service.js";
let RoutingController = class RoutingController {
    routingService;
    constructor(routingService) {
        this.routingService = routingService;
    }
    fetchWorkload(query, request) {
        return this.routingService.fetchWorkload(query, routingContextFromRequest(request));
    }
    createAssignment(payload, request) {
        return this.routingService.createAssignment(payload, routingContextFromRequest(request));
    }
    simulateAssignment(payload, request) {
        return this.routingService.simulateAssignment(payload, routingContextFromRequest(request));
    }
    previewRedistribution(payload, request) {
        return this.routingService.previewRedistribution(payload, routingContextFromRequest(request));
    }
    commitRedistribution(payload, request) {
        return this.routingService.commitRedistribution(payload, routingContextFromRequest(request));
    }
    pauseSla(payload, request) {
        return this.routingService.pauseSla(payload, routingContextFromRequest(request));
    }
    startRescue(payload, request) {
        return this.routingService.startRescue(payload, routingContextFromRequest(request));
    }
    resolveRescue(payload, request) {
        return this.routingService.resolveRescue(payload, routingContextFromRequest(request));
    }
    fetchRescueReport(query, request) {
        return this.routingService.fetchRescueReport(query, routingContextFromRequest(request));
    }
};
__decorate([
    Get("workload"),
    RequireTenantOperatorPermission("routing.read"),
    RequireServiceAdminAction("routing.read"),
    ApiOkResponse({ description: "Operator workload and queue health envelope" }),
    __param(0, Query()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], RoutingController.prototype, "fetchWorkload", null);
__decorate([
    Post("assignments"),
    RequireTenantOperatorPermission("routing.redistribute"),
    RequireServiceAdminAction("routing.redistribute"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Assignment, transfer or return-to-queue envelope" }),
    __param(0, Body()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], RoutingController.prototype, "createAssignment", null);
__decorate([
    Post("assignments/simulate"),
    RequireTenantOperatorPermission("routing.read"),
    RequireServiceAdminAction("routing.read"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Assignment simulation and explainable routing candidates envelope" }),
    __param(0, Body()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], RoutingController.prototype, "simulateAssignment", null);
__decorate([
    Post("redistribution/preview"),
    RequireTenantOperatorPermission("routing.redistribute"),
    RequireServiceAdminAction("routing.redistribute"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Batch redistribution preview with capacity conflicts and SLA impact" }),
    __param(0, Body()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], RoutingController.prototype, "previewRedistribution", null);
__decorate([
    Post("redistribution/commit"),
    RequireTenantOperatorPermission("routing.redistribute"),
    RequireServiceAdminAction("routing.redistribute"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Batch redistribution commit with audit and assignment descriptors" }),
    __param(0, Body()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], RoutingController.prototype, "commitRedistribution", null);
__decorate([
    Post("sla/pause"),
    RequireTenantOperatorPermission("routing.redistribute"),
    RequireServiceAdminAction("routing.redistribute"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "SLA pause envelope with resume job descriptor" }),
    __param(0, Body()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], RoutingController.prototype, "pauseSla", null);
__decorate([
    Post("rescue/start"),
    RequireTenantOperatorPermission("routing.redistribute"),
    RequireServiceAdminAction("routing.redistribute"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Rescue timer start envelope" }),
    __param(0, Body()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], RoutingController.prototype, "startRescue", null);
__decorate([
    Post("rescue/resolve"),
    RequireTenantOperatorPermission("routing.redistribute"),
    RequireServiceAdminAction("routing.redistribute"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Rescue resolution and report descriptor envelope" }),
    __param(0, Body()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], RoutingController.prototype, "resolveRescue", null);
__decorate([
    Get("reports/rescue"),
    RequireTenantOperatorPermission("routing.read"),
    RequireServiceAdminAction("routing.read"),
    ApiOkResponse({ description: "Rescue report rows and export descriptor envelope" }),
    __param(0, Query()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], RoutingController.prototype, "fetchRescueReport", null);
RoutingController = __decorate([
    ApiTags("routing"),
    UseGuards(TenantOperatorOrServiceAdminGuard),
    Controller("routing"),
    __metadata("design:paramtypes", [RoutingService])
], RoutingController);
export { RoutingController };
function routingContextFromRequest(request) {
    const tenantId = request.tenantOperatorContext?.tenantId ?? request.serviceAdminContext?.currentTenantId;
    if (!tenantId) {
        return {};
    }
    if (request.tenantOperatorContext) {
        return {
            actorId: request.tenantOperatorContext.userId,
            actorType: "operator",
            tenantId
        };
    }
    return {
        actorId: request.serviceAdminContext?.actor.id,
        actorName: request.serviceAdminContext?.actor.name,
        actorType: "service_admin",
        tenantId
    };
}
//# sourceMappingURL=routing.controller.js.map