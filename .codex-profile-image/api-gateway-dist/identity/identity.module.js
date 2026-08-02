var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Module } from "@nestjs/common";
import { TenantOperatorOrServiceAdminGuard } from "../conversation/tenant-operator-or-service-admin.guard.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { ServiceAdminSessionGuard } from "./service-admin-session.guard.js";
import { PermissionController } from "./permission.controller.js";
import { PermissionService } from "./permission.service.js";
import { SettingsController } from "./settings.controller.js";
import { SettingsEmployeeService } from "./settings-employee.service.js";
import { SettingsRulesService } from "./settings-rules.service.js";
import { TenantController } from "./tenant.controller.js";
import { TenantProvisionController } from "./tenant-provision.controller.js";
import { TenantProvisionService } from "./tenant-provision.service.js";
import { TenantService } from "./tenant.service.js";
import { TenantOperatorAuthGuard } from "./tenant-operator-auth.guard.js";
import { PresenceModule } from "../presence/presence.module.js";
import { OperatorPresenceService } from "../presence/presence.service.js";
let IdentityModule = class IdentityModule {
};
IdentityModule = __decorate([
    Module({
        imports: [PresenceModule],
        controllers: [AuthController, PermissionController, SettingsController, TenantController, TenantProvisionController],
        providers: [
            {
                provide: AuthService,
                inject: [OperatorPresenceService],
                useFactory: (operatorPresenceService) => new AuthService(undefined, undefined, undefined, operatorPresenceService)
            },
            TenantOperatorOrServiceAdminGuard,
            ServiceAdminSessionGuard,
            TenantOperatorAuthGuard,
            PermissionService,
            SettingsEmployeeService,
            SettingsRulesService,
            TenantProvisionService,
            TenantService
        ]
    })
], IdentityModule);
export { IdentityModule };
//# sourceMappingURL=identity.module.js.map