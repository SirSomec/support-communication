var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Module } from "@nestjs/common";
import { ServiceAdminSessionGuard } from "../identity/service-admin-session.guard.js";
import { PlatformController, PlatformMonitoringAliasController } from "./platform.controller.js";
import { PlatformMonitoringService } from "./platform-monitoring.service.js";
let PlatformModule = class PlatformModule {
};
PlatformModule = __decorate([
    Module({
        controllers: [PlatformController, PlatformMonitoringAliasController],
        providers: [ServiceAdminSessionGuard, PlatformMonitoringService],
        exports: [PlatformMonitoringService]
    })
], PlatformModule);
export { PlatformModule };
//# sourceMappingURL=platform.module.js.map