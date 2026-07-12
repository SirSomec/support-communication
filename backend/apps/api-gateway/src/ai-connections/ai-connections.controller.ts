import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { RequireServiceAdminAction } from "../identity/service-admin-auth.js";
import { ServiceAdminSessionGuard } from "../identity/service-admin-session.guard.js";
import { AiConnectionsService, type AiConnectionWriteInput } from "./ai-connections.service.js";

@ApiTags("service-admin", "ai-connections")
@UseGuards(ServiceAdminSessionGuard)
@Controller("service-admin/tenants/:tenantId/ai-connections")
export class AiConnectionsController {
  constructor(private readonly service: AiConnectionsService) {}

  @Get()
  @RequireServiceAdminAction("ai.connections.manage")
  @ApiOkResponse({ description: "Tenant AI connection metadata without secrets" })
  list(@Param("tenantId") tenantId: string) { return this.service.list(tenantId); }

  @Post()
  @RequireServiceAdminAction("ai.connections.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Create tenant AI connection without returning secret" })
  create(@Param("tenantId") tenantId: string, @Body() body: AiConnectionWriteInput) { return this.service.create(tenantId, body ?? {}); }

  @Patch(":connectionId")
  @RequireServiceAdminAction("ai.connections.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Update or rotate tenant AI connection secret" })
  update(@Param("tenantId") tenantId: string, @Param("connectionId") connectionId: string, @Body() body: AiConnectionWriteInput) { return this.service.update(tenantId, connectionId, body ?? {}); }

  @Post(":connectionId/rotate")
  @RequireServiceAdminAction("ai.connections.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Rotate tenant AI connection secret without returning it" })
  rotate(@Param("tenantId") tenantId: string, @Param("connectionId") connectionId: string, @Body() body: Pick<AiConnectionWriteInput, "secret">) { return this.service.rotate(tenantId, connectionId, body ?? {}); }

  @Post(":connectionId/test")
  @RequireServiceAdminAction("ai.connections.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Run minimal provider connectivity check without customer data" })
  test(@Param("tenantId") tenantId: string, @Param("connectionId") connectionId: string) { return this.service.test(tenantId, connectionId); }

  @Post(":connectionId/disable")
  @RequireServiceAdminAction("ai.connections.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Disable tenant AI connection" })
  disable(@Param("tenantId") tenantId: string, @Param("connectionId") connectionId: string) { return this.service.disable(tenantId, connectionId); }

  @Delete(":connectionId")
  @RequireServiceAdminAction("ai.connections.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Delete tenant AI connection and encrypted secret" })
  remove(@Param("tenantId") tenantId: string, @Param("connectionId") connectionId: string) { return this.service.remove(tenantId, connectionId); }
}
