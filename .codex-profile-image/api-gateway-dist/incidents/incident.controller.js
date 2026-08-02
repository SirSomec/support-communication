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
import { IncidentService } from "./incident.service.js";
let IncidentController = class IncidentController {
    incidentService;
    constructor(incidentService) {
        this.incidentService = incidentService;
    }
    fetchIncidents(filters) {
        return this.incidentService.fetchIncidents(filters);
    }
    fetchIncidentDetail(incidentId) {
        return this.incidentService.fetchIncidentDetail(incidentId);
    }
    addIncidentUpdate(incidentId, payload, request) {
        return this.incidentService.addIncidentUpdate({
            ...payload,
            actor: request.serviceAdminContext?.actor,
            incidentId
        });
    }
};
__decorate([
    Get(),
    RequireServiceAdminAction("incidents.read"),
    ApiOkResponse({ description: "Incident list envelope" }),
    __param(0, Query()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], IncidentController.prototype, "fetchIncidents", null);
__decorate([
    Get(":incidentId"),
    RequireServiceAdminAction("incidents.read"),
    ApiOkResponse({ description: "Incident detail envelope" }),
    __param(0, Param("incidentId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], IncidentController.prototype, "fetchIncidentDetail", null);
__decorate([
    Post(":incidentId/updates"),
    RequireServiceAdminAction("incidents.manage"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Incident timeline update envelope" }),
    __param(0, Param("incidentId")),
    __param(1, Body()),
    __param(2, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], IncidentController.prototype, "addIncidentUpdate", null);
IncidentController = __decorate([
    ApiTags("incidents"),
    UseGuards(ServiceAdminSessionGuard),
    Controller("incidents"),
    __metadata("design:paramtypes", [IncidentService])
], IncidentController);
export { IncidentController };
//# sourceMappingURL=incident.controller.js.map