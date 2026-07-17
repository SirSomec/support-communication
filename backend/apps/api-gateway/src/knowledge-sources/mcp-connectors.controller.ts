import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { RequireServiceAdminAction, type ServiceAdminRequest } from "../identity/service-admin-auth.js";
import { ServiceAdminSessionGuard } from "../identity/service-admin-session.guard.js";
import { McpConnectorsService, type McpConnectorWriteInput } from "./mcp-connectors.service.js";

@ApiTags("service-admin", "mcp-connectors")
@UseGuards(ServiceAdminSessionGuard)
@Controller("service-admin/tenants/:tenantId/mcp-connectors")
export class McpConnectorsController {
  constructor(private readonly service: McpConnectorsService) {}

  @Get()
  @RequireServiceAdminAction("knowledge.sources.write")
  @ApiOkResponse({ description: "Tenant MCP connector metadata; no credentials or headers" })
  list(@Param("tenantId") tenantId: string) { return this.service.list(tenantId); }

  @Post()
  @RequireServiceAdminAction("knowledge.sources.write")
  @HttpCode(HttpStatus.OK)
  create(@Param("tenantId") tenantId: string, @Body() body: McpConnectorWriteInput, @Req() request: ServiceAdminRequest) { return this.service.create(tenantId, body ?? {}, actor(request)); }

  @Patch(":connectorId")
  @RequireServiceAdminAction("knowledge.sources.write")
  @HttpCode(HttpStatus.OK)
  update(@Param("tenantId") tenantId: string, @Param("connectorId") id: string, @Body() body: McpConnectorWriteInput, @Req() request: ServiceAdminRequest) { return this.service.update(tenantId, id, body ?? {}, actor(request)); }

  @Post(":connectorId/approve")
  @RequireServiceAdminAction("knowledge.sources.write")
  @HttpCode(HttpStatus.OK)
  approve(@Param("tenantId") tenantId: string, @Param("connectorId") id: string, @Req() request: ServiceAdminRequest) { return this.service.approve(tenantId, id, actor(request)); }

  @Post(":connectorId/enable")
  @RequireServiceAdminAction("knowledge.sources.write")
  @HttpCode(HttpStatus.OK)
  enable(@Param("tenantId") tenantId: string, @Param("connectorId") id: string, @Req() request: ServiceAdminRequest) { return this.service.setEnabled(tenantId, id, true, actor(request)); }

  @Post(":connectorId/disable")
  @RequireServiceAdminAction("knowledge.sources.write")
  @HttpCode(HttpStatus.OK)
  disable(@Param("tenantId") tenantId: string, @Param("connectorId") id: string, @Req() request: ServiceAdminRequest) { return this.service.setEnabled(tenantId, id, false, actor(request)); }
}
function actor(request: ServiceAdminRequest) { return request.serviceAdminContext?.actor ?? { id: "service-admin", name: "Service Admin" }; }
