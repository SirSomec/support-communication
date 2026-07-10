import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { TenantOperatorOrServiceAdminGuard } from "../conversation/tenant-operator-or-service-admin.guard.js";
import { RequireServiceAdminAction } from "../identity/service-admin-auth.js";
import { RequireTenantOperatorPermission } from "../identity/tenant-operator-auth.js";
import { PermissionService } from "./permission.service.js";

@ApiTags("permissions")
@Controller("permissions")
export class PermissionController {
  constructor(private readonly permissionService: PermissionService) {}

  @Post("validate")
  @UseGuards(TenantOperatorOrServiceAdminGuard)
  @RequireTenantOperatorPermission("permissions.validate")
  @RequireServiceAdminAction("permissions.validate")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Server-side permission decision envelope" })
  validatePermission(@Body() payload: { action: string; actorRole?: string; resource: string; roleMode?: string; tenantId?: string }) {
    return this.permissionService.validatePermission(payload);
  }

  @Get("model")
  @UseGuards(TenantOperatorOrServiceAdminGuard)
  @RequireTenantOperatorPermission("permissions.read")
  @RequireServiceAdminAction("permissions.read")
  @ApiOkResponse({ description: "Permission model envelope" })
  fetchPermissionModel() {
    return this.permissionService.fetchPermissionModel();
  }
}
