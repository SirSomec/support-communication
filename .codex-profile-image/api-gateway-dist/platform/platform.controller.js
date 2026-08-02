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
import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { ServiceAdminSessionGuard } from "../identity/service-admin-session.guard.js";
import { RequireServiceAdminAction } from "../identity/service-admin-auth.js";
import { PlatformMonitoringService } from "./platform-monitoring.service.js";
let PlatformController = class PlatformController {
    platformMonitoringService;
    constructor(platformMonitoringService) {
        this.platformMonitoringService = platformMonitoringService;
    }
    fetchPlatformSnapshot(filters) {
        return this.platformMonitoringService.fetchPlatformSnapshot(filters);
    }
    fetchComponentDrilldown(componentId) {
        return this.platformMonitoringService.fetchComponentDrilldown(componentId);
    }
    acknowledgeComponentAlert(componentId, payload, idempotencyKey, request) {
        return this.platformMonitoringService.acknowledgeComponentAlert({
            ...payload,
            actor: request.serviceAdminContext?.actor,
            componentId,
            idempotencyKey: idempotencyKey ?? payload.idempotencyKey
        });
    }
    ingestTelemetrySample(payload) {
        return this.platformMonitoringService.ingestTelemetrySample(payload);
    }
    writeHealthRollup(payload) {
        return this.platformMonitoringService.writeHealthRollup(payload);
    }
    saveAlertRoutingRule(payload) {
        return this.platformMonitoringService.saveAlertRoutingRule(payload);
    }
};
__decorate([
    Get("snapshot"),
    RequireServiceAdminAction("platform.read"),
    ApiOkResponse({ description: "Platform health and metric snapshot envelope" }),
    __param(0, Query()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], PlatformController.prototype, "fetchPlatformSnapshot", null);
__decorate([
    Get("components/:componentId"),
    RequireServiceAdminAction("platform.read"),
    ApiOkResponse({ description: "Platform component drilldown envelope" }),
    __param(0, Param("componentId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], PlatformController.prototype, "fetchComponentDrilldown", null);
__decorate([
    Post("components/:componentId/acknowledgements"),
    RequireServiceAdminAction("platform.alert.acknowledge"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Platform alert acknowledgement envelope" }),
    __param(0, Param("componentId")),
    __param(1, Body()),
    __param(2, Headers("idempotency-key")),
    __param(3, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], PlatformController.prototype, "acknowledgeComponentAlert", null);
__decorate([
    Post("telemetry/samples"),
    RequireServiceAdminAction("platform.telemetry.ingest"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Platform telemetry sample ingestion envelope" }),
    __param(0, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], PlatformController.prototype, "ingestTelemetrySample", null);
__decorate([
    Post("health-rollups"),
    RequireServiceAdminAction("platform.health-rollups.write"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Platform component health rollup write envelope" }),
    __param(0, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], PlatformController.prototype, "writeHealthRollup", null);
__decorate([
    Post("alert-routing/rules"),
    RequireServiceAdminAction("platform.alert-routing.write"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Platform alert routing rule persistence envelope" }),
    __param(0, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], PlatformController.prototype, "saveAlertRoutingRule", null);
PlatformController = __decorate([
    ApiTags("platform"),
    UseGuards(ServiceAdminSessionGuard),
    Controller("platform"),
    __metadata("design:paramtypes", [PlatformMonitoringService])
], PlatformController);
export { PlatformController };
let PlatformMonitoringAliasController = class PlatformMonitoringAliasController {
    platformMonitoringService;
    constructor(platformMonitoringService) {
        this.platformMonitoringService = platformMonitoringService;
    }
    fetchPlatformSnapshot(filters) {
        return this.platformMonitoringService.fetchPlatformSnapshot(filters);
    }
    fetchComponentDrilldown(componentId) {
        return this.platformMonitoringService.fetchComponentDrilldown(componentId);
    }
    acknowledgeComponentAlert(componentId, payload, idempotencyKey, request) {
        return this.platformMonitoringService.acknowledgeComponentAlert({
            ...payload,
            actor: request.serviceAdminContext?.actor,
            componentId,
            idempotencyKey: idempotencyKey ?? payload.idempotencyKey
        });
    }
    ingestTelemetrySample(payload) {
        return this.platformMonitoringService.ingestTelemetrySample(payload);
    }
    writeHealthRollup(payload) {
        return this.platformMonitoringService.writeHealthRollup(payload);
    }
    saveAlertRoutingRule(payload) {
        return this.platformMonitoringService.saveAlertRoutingRule(payload);
    }
};
__decorate([
    Get("snapshot"),
    RequireServiceAdminAction("platform.read"),
    ApiOkResponse({ description: "Platform health and metric snapshot envelope" }),
    __param(0, Query()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], PlatformMonitoringAliasController.prototype, "fetchPlatformSnapshot", null);
__decorate([
    Get("components/:componentId"),
    RequireServiceAdminAction("platform.read"),
    ApiOkResponse({ description: "Platform component drilldown envelope" }),
    __param(0, Param("componentId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], PlatformMonitoringAliasController.prototype, "fetchComponentDrilldown", null);
__decorate([
    Post("components/:componentId/acknowledgements"),
    RequireServiceAdminAction("platform.alert.acknowledge"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Platform alert acknowledgement envelope" }),
    __param(0, Param("componentId")),
    __param(1, Body()),
    __param(2, Headers("idempotency-key")),
    __param(3, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], PlatformMonitoringAliasController.prototype, "acknowledgeComponentAlert", null);
__decorate([
    Post("telemetry/samples"),
    RequireServiceAdminAction("platform.telemetry.ingest"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Platform telemetry sample ingestion envelope" }),
    __param(0, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], PlatformMonitoringAliasController.prototype, "ingestTelemetrySample", null);
__decorate([
    Post("health-rollups"),
    RequireServiceAdminAction("platform.health-rollups.write"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Platform component health rollup write envelope" }),
    __param(0, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], PlatformMonitoringAliasController.prototype, "writeHealthRollup", null);
__decorate([
    Post("alert-routing/rules"),
    RequireServiceAdminAction("platform.alert-routing.write"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Platform alert routing rule persistence envelope" }),
    __param(0, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], PlatformMonitoringAliasController.prototype, "saveAlertRoutingRule", null);
PlatformMonitoringAliasController = __decorate([
    ApiTags("platform-monitoring"),
    UseGuards(ServiceAdminSessionGuard),
    Controller("platform-monitoring"),
    __metadata("design:paramtypes", [PlatformMonitoringService])
], PlatformMonitoringAliasController);
export { PlatformMonitoringAliasController };
//# sourceMappingURL=platform.controller.js.map