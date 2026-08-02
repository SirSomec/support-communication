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
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { ServiceAdminSessionGuard } from "../identity/service-admin-session.guard.js";
import { RequireServiceAdminAction } from "../identity/service-admin-auth.js";
import { OperationsReadinessService } from "./operations-readiness.service.js";
let OperationsController = class OperationsController {
    operationsReadinessService;
    constructor(operationsReadinessService) {
        this.operationsReadinessService = operationsReadinessService;
    }
    fetchReadinessDashboard(query) {
        return this.operationsReadinessService.fetchReadinessDashboard(query);
    }
    queueLoadTestRun(scenarioId, payload, request) {
        return this.operationsReadinessService.queueLoadTestRun({ ...payload, actor: request.serviceAdminContext?.actor, scenarioId });
    }
    queueRestoreCheck(drillId, payload, request) {
        return this.operationsReadinessService.queueRestoreCheck({ ...payload, actor: request.serviceAdminContext?.actor, drillId });
    }
    fetchDeadLetterDashboard(query) {
        return this.operationsReadinessService.fetchDeadLetterDashboard(query);
    }
    replayDeadLetterMessage(messageId, payload, request) {
        return this.operationsReadinessService.replayDeadLetterMessage({ ...payload, actor: request.serviceAdminContext?.actor, messageId });
    }
    checkMigrationRollback(migrationId, payload, request) {
        return this.operationsReadinessService.checkMigrationRollback({ ...payload, actor: request.serviceAdminContext?.actor, migrationId });
    }
    fetchSecurityReview(query) {
        return this.operationsReadinessService.fetchSecurityReview(query);
    }
};
__decorate([
    Get("readiness"),
    RequireServiceAdminAction("operations.read"),
    ApiOkResponse({ description: "Production readiness dashboard envelope" }),
    __param(0, Query()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], OperationsController.prototype, "fetchReadinessDashboard", null);
__decorate([
    Post("load-tests/:scenarioId/runs"),
    RequireServiceAdminAction("operations.write"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Queued load test run envelope" }),
    __param(0, Param("scenarioId")),
    __param(1, Body()),
    __param(2, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], OperationsController.prototype, "queueLoadTestRun", null);
__decorate([
    Post("backup-drills/:drillId/restore-checks"),
    RequireServiceAdminAction("operations.write"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Queued restore drill check envelope" }),
    __param(0, Param("drillId")),
    __param(1, Body()),
    __param(2, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], OperationsController.prototype, "queueRestoreCheck", null);
__decorate([
    Get("dead-letter"),
    RequireServiceAdminAction("operations.read"),
    ApiOkResponse({ description: "Dead-letter dashboard envelope" }),
    __param(0, Query()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], OperationsController.prototype, "fetchDeadLetterDashboard", null);
__decorate([
    Post("dead-letter/:messageId/replay"),
    RequireServiceAdminAction("operations.write"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Dead-letter replay queue envelope" }),
    __param(0, Param("messageId")),
    __param(1, Body()),
    __param(2, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], OperationsController.prototype, "replayDeadLetterMessage", null);
__decorate([
    Post("migrations/:migrationId/rollback-check"),
    RequireServiceAdminAction("operations.write"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Migration rollback compatibility envelope" }),
    __param(0, Param("migrationId")),
    __param(1, Body()),
    __param(2, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], OperationsController.prototype, "checkMigrationRollback", null);
__decorate([
    Get("security-review"),
    RequireServiceAdminAction("security.review"),
    ApiOkResponse({ description: "Security review controls envelope" }),
    __param(0, Query()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], OperationsController.prototype, "fetchSecurityReview", null);
OperationsController = __decorate([
    ApiTags("operations"),
    UseGuards(ServiceAdminSessionGuard),
    Controller("operations"),
    __metadata("design:paramtypes", [OperationsReadinessService])
], OperationsController);
export { OperationsController };
//# sourceMappingURL=operations.controller.js.map