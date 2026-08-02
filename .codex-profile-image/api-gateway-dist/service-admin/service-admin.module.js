var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Module } from "@nestjs/common";
import { ServiceAdminSessionGuard } from "../identity/service-admin-session.guard.js";
import { MailSettingsController } from "../mail/mail-settings.controller.js";
import { MailSettingsService } from "../mail/mail-settings.service.js";
import { ServiceAdminController } from "./service-admin.controller.js";
import { ServiceAdminService } from "./service-admin.service.js";
let ServiceAdminModule = class ServiceAdminModule {
};
ServiceAdminModule = __decorate([
    Module({
        controllers: [MailSettingsController, ServiceAdminController],
        providers: [MailSettingsService, ServiceAdminService, ServiceAdminSessionGuard],
        exports: [ServiceAdminService]
    })
], ServiceAdminModule);
export { ServiceAdminModule };
//# sourceMappingURL=service-admin.module.js.map