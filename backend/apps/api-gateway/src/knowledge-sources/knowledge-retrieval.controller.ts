import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { TenantOperatorOrServiceAdminGuard } from "../conversation/tenant-operator-or-service-admin.guard.js";
import { RequireServiceAdminAction, type ServiceAdminRequest } from "../identity/service-admin-auth.js";
import { RequireTenantOperatorPermission, type TenantOperatorRequest } from "../identity/tenant-operator-auth.js";
import { KnowledgeRetrievalApiService } from "./knowledge-retrieval-api.service.js";
@ApiTags("knowledge-retrieval") @UseGuards(TenantOperatorOrServiceAdminGuard) @Controller("knowledge-retrieval")
export class KnowledgeRetrievalController {
  constructor(private readonly service: KnowledgeRetrievalApiService) {}
  @Post("query") @HttpCode(HttpStatus.OK) @RequireTenantOperatorPermission("knowledge.read") @RequireServiceAdminAction("knowledge.read")
  @ApiOkResponse({ description: "Tenant- and scenario-bound passages with versioned offset citations and token budget" })
  retrieve(@Body() body: { query?: string; scenarioId?: string; tokenBudget?: number }, @Req() request: TenantOperatorRequest & ServiceAdminRequest) { return this.service.retrieveScenario({ ...(body ?? {}), tenantId: request.tenantOperatorContext?.tenantId ?? request.serviceAdminContext?.currentTenantId ?? "" }); }
}
