var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Module } from "@nestjs/common";
import { ServiceAdminSessionGuard } from "../identity/service-admin-session.guard.js";
import { IncidentController } from "./incident.controller.js";
import { IncidentService } from "./incident.service.js";
let IncidentModule = class IncidentModule {
};
IncidentModule = __decorate([
    Module({
        controllers: [IncidentController],
        providers: [ServiceAdminSessionGuard, IncidentService],
        exports: [IncidentService]
    })
], IncidentModule);
export { IncidentModule };
//# sourceMappingURL=incident.module.js.map