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

@Module({
  imports: [PresenceModule],
  controllers: [AuthController, PermissionController, SettingsController, TenantController, TenantProvisionController],
  providers: [
    {
      provide: AuthService,
      inject: [OperatorPresenceService],
      useFactory: (operatorPresenceService: OperatorPresenceService) => new AuthService(
        undefined,
        undefined,
        undefined,
        operatorPresenceService
      )
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
export class IdentityModule {}
