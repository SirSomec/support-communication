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
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { TenantOperatorOrServiceAdminGuard } from "../conversation/tenant-operator-or-service-admin.guard.js";
import { RequireServiceAdminAction } from "../identity/service-admin-auth.js";
import { RequireTenantOperatorPermission } from "../identity/tenant-operator-auth.js";
import { QueueDirectoryService } from "./queue-directory.service.js";
let QueueDirectoryController = class QueueDirectoryController {
    queueDirectoryService;
    constructor(queueDirectoryService) {
        this.queueDirectoryService = queueDirectoryService;
    }
    fetchQueues(query, request) {
        return this.queueDirectoryService.fetchQueues(query, queueContextFromRequest(request));
    }
    createQueue(payload, request) {
        return this.queueDirectoryService.createQueue(payload, queueContextFromRequest(request));
    }
    updateQueueFromBody(payload, request) {
        return this.queueDirectoryService.updateQueue(payload.queueId, payload, queueContextFromRequest(request));
    }
    updateQueue(queueId, payload, request) {
        return this.queueDirectoryService.updateQueue(queueId, payload, queueContextFromRequest(request));
    }
};
__decorate([
    Get(),
    RequireTenantOperatorPermission("routing.read"),
    RequireServiceAdminAction("routing.read"),
    ApiOkResponse({ description: "Tenant queue directory envelope with active member counts" }),
    __param(0, Query()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], QueueDirectoryController.prototype, "fetchQueues", null);
__decorate([
    Post(),
    RequireTenantOperatorPermission("routing.redistribute"),
    RequireServiceAdminAction("routing.redistribute"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Created tenant support queue envelope" }),
    __param(0, Body()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], QueueDirectoryController.prototype, "createQueue", null);
__decorate([
    Patch(),
    RequireTenantOperatorPermission("routing.redistribute"),
    RequireServiceAdminAction("routing.redistribute"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Updated tenant support queue envelope" }),
    __param(0, Body()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], QueueDirectoryController.prototype, "updateQueueFromBody", null);
__decorate([
    Patch(":queueId"),
    RequireTenantOperatorPermission("routing.redistribute"),
    RequireServiceAdminAction("routing.redistribute"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Updated tenant support queue envelope" }),
    __param(0, Param("queueId")),
    __param(1, Body()),
    __param(2, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], QueueDirectoryController.prototype, "updateQueue", null);
QueueDirectoryController = __decorate([
    ApiTags("routing"),
    UseGuards(TenantOperatorOrServiceAdminGuard),
    Controller("routing/queues"),
    __metadata("design:paramtypes", [QueueDirectoryService])
], QueueDirectoryController);
export { QueueDirectoryController };
function queueContextFromRequest(request) {
    return {
        tenantId: request.tenantOperatorContext?.tenantId ?? request.serviceAdminContext?.currentTenantId
    };
}
//# sourceMappingURL=queue-directory.controller.js.map