import { Body, Controller, Get, HttpCode, HttpStatus, Param, Put, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { RequireServiceAdminAction } from "../identity/service-admin-auth.js";
import { ServiceAdminSessionGuard } from "../identity/service-admin-session.guard.js";
import { KnowledgeSourcesService, type UrlSourcePolicyWriteInput } from "./knowledge-sources.service.js";

@ApiTags("service-admin", "knowledge-sources")
@UseGuards(ServiceAdminSessionGuard)
@Controller("service-admin/tenants/:tenantId/knowledge-source-url-policy")
export class UrlSourcePolicyController {
  constructor(private readonly service: KnowledgeSourcesService) {}

  @Get()
  @RequireServiceAdminAction("knowledge.write")
  @ApiOkResponse({ description: "Tenant URL source allowlist policy" })
  get(@Param("tenantId") tenantId: string) { return this.service.getUrlPolicy(tenantId); }

  @Put()
  @RequireServiceAdminAction("knowledge.write")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Set exact-host URL source allowlist; null allows any safe public HTTPS host" })
  set(@Param("tenantId") tenantId: string, @Body() body: UrlSourcePolicyWriteInput) { return this.service.setUrlPolicy(tenantId, body ?? {}); }
}
