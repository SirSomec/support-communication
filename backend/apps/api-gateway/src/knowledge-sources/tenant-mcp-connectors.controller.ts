import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { createEnvelope, type BackendEnvelope } from "@support-communication/envelope";
import { TenantOperatorOrServiceAdminGuard } from "../conversation/tenant-operator-or-service-admin.guard.js";
import { RequireServiceAdminAction, type ServiceAdminRequest } from "../identity/service-admin-auth.js";
import { RequireTenantOperatorPermission, type TenantOperatorRequest } from "../identity/tenant-operator-auth.js";
import { McpConnectorRepository } from "./mcp-connector.repository.js";
import { McpConnectorsService, type McpConnectorWriteInput } from "./mcp-connectors.service.js";

/**
 * BAI-831: раздел «Знания» тенанта видит свои MCP-подключения и подаёт заявку.
 * Одобрение и включение остаются за Service Admin (mcp-connectors.controller).
 * Секреты/заголовки не возвращаются — только метаданные.
 */
// Namespace deliberately outside "knowledge/…": the workspace article controller
// owns the greedy "knowledge/:articleId" route and would otherwise shadow these.
@ApiTags("knowledge-mcp-connectors")
@UseGuards(TenantOperatorOrServiceAdminGuard)
@Controller("knowledge-mcp-connectors")
export class TenantMcpConnectorsController {
  constructor(private readonly service: McpConnectorsService) {}

  @Get()
  @RequireTenantOperatorPermission("knowledge.read")
  @RequireServiceAdminAction("knowledge.read")
  @ApiOkResponse({ description: "Tenant MCP connectors with approval status; no credentials" })
  list(@Req() request: TenantOperatorRequest & ServiceAdminRequest): BackendEnvelope<Record<string, unknown>> {
    const tenantId = resolveTenant(request);
    return createEnvelope({
      data: { connectors: McpConnectorRepository.default().list(tenantId) },
      meta: { apiVersion: "v1", tenantId },
      operation: "listTenantMcpConnectors",
      service: "tenantMcpConnectorsService",
      traceId: `trc_tenant_mcp_${Date.now()}`
    });
  }

  @Post("requests")
  @RequireTenantOperatorPermission("knowledge.write")
  @RequireServiceAdminAction("knowledge.write")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Submit an MCP connector request for service-admin approval" })
  request(@Body() body: McpConnectorWriteInput, @Req() request: TenantOperatorRequest & ServiceAdminRequest) {
    const tenantId = resolveTenant(request);
    const requestedBy = request.tenantOperatorContext?.userId ?? request.serviceAdminContext?.actor?.id ?? "tenant-admin";
    return this.service.request(tenantId, body ?? {}, requestedBy);
  }
}

function resolveTenant(request: TenantOperatorRequest & ServiceAdminRequest): string {
  return request.tenantOperatorContext?.tenantId ?? request.serviceAdminContext?.currentTenantId ?? "";
}
