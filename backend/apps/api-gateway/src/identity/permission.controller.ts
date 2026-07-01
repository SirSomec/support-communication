import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { DemoServiceAdminGuard } from "./demo-service-admin.guard.js";
import { PermissionService } from "./permission.service.js";
import { RequireServiceAdminAction } from "./service-admin-auth.js";

@ApiTags("permissions")
@UseGuards(DemoServiceAdminGuard)
@Controller("permissions")
export class PermissionController {
  constructor(private readonly permissionService: PermissionService) {}

  @Post("validate")
  @RequireServiceAdminAction("permissions.validate")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Server-side permission decision envelope" })
  validatePermission(@Body() payload: { action: string; actorRole?: string; resource: string; roleMode?: string }) {
    return this.permissionService.validatePermission(payload);
  }

  @Get("model")
  @RequireServiceAdminAction("permissions.read")
  @ApiOkResponse({ description: "Permission model envelope" })
  fetchPermissionModel() {
    return this.permissionService.fetchPermissionModel();
  }
}
