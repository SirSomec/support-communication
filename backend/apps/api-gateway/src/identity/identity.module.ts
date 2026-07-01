import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { DemoServiceAdminGuard } from "./demo-service-admin.guard.js";
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

@Module({
  controllers: [AuthController, PermissionController, SettingsController, TenantController, TenantProvisionController],
  providers: [
    AuthService,
    DemoServiceAdminGuard,
    TenantOperatorAuthGuard,
    PermissionService,
    SettingsEmployeeService,
    SettingsRulesService,
    TenantProvisionService,
    TenantService
  ]
})
export class IdentityModule {}
