import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { DemoServiceAdminGuard } from "./demo-service-admin.guard.js";
import { PermissionController } from "./permission.controller.js";
import { PermissionService } from "./permission.service.js";
import { TenantController } from "./tenant.controller.js";
import { TenantService } from "./tenant.service.js";

@Module({
  controllers: [AuthController, PermissionController, TenantController],
  providers: [AuthService, DemoServiceAdminGuard, PermissionService, TenantService]
})
export class IdentityModule {}
