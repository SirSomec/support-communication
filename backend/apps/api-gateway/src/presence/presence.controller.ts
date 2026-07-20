import { Body, Controller, Get, HttpCode, HttpStatus, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { TenantOperatorOrServiceAdminGuard } from "../conversation/tenant-operator-or-service-admin.guard.js";
import { RequireServiceAdminAction, type ServiceAdminRequest } from "../identity/service-admin-auth.js";
import { RequireTenantOperatorPermission, type TenantOperatorRequest } from "../identity/tenant-operator-auth.js";
import { OperatorPresenceService, type PresenceRequestContext } from "./presence.service.js";

@ApiTags("presence")
@UseGuards(TenantOperatorOrServiceAdminGuard)
@Controller("presence")
export class PresenceController {
  constructor(private readonly presenceService: OperatorPresenceService) {}

  @Get("me")
  @RequireTenantOperatorPermission("presence.write")
  @RequireServiceAdminAction("presence.write")
  @ApiOkResponse({ description: "Current operator presence status and status catalog envelope" })
  fetchMyPresence(@Req() request: TenantOperatorRequest & ServiceAdminRequest) {
    return this.presenceService.fetchMyPresence(presenceContextFromRequest(request));
  }

  @Put("me")
  @RequireTenantOperatorPermission("presence.write")
  @RequireServiceAdminAction("presence.write")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Operator presence transition envelope with realtime event descriptor" })
  setMyPresence(@Body() payload: { status?: string }, @Req() request: TenantOperatorRequest & ServiceAdminRequest) {
    return this.presenceService.setMyPresence(payload, presenceContextFromRequest(request));
  }

  @Post("me/disconnect")
  @RequireTenantOperatorPermission("presence.write")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Marks the current operator unavailable only when their current status is online" })
  disconnectMyPresence(@Req() request: TenantOperatorRequest) {
    return this.presenceService.markMyPresenceUnavailableIfOnline(presenceContextFromRequest(request));
  }

  @Get("team")
  @RequireTenantOperatorPermission("presence.read")
  @RequireServiceAdminAction("presence.read")
  @ApiOkResponse({ description: "Team presence statuses with time-in-status totals envelope" })
  fetchTeamPresence(@Query() filters: { from?: string; to?: string }, @Req() request: TenantOperatorRequest & ServiceAdminRequest) {
    return this.presenceService.fetchTeamPresence(filters, presenceContextFromRequest(request));
  }
}

function presenceContextFromRequest(request: TenantOperatorRequest & ServiceAdminRequest): PresenceRequestContext {
  if (request.tenantOperatorContext) {
    return {
      actorId: request.tenantOperatorContext.userId,
      actorType: "operator",
      tenantId: request.tenantOperatorContext.tenantId
    };
  }

  const tenantId = request.serviceAdminContext?.currentTenantId;
  if (!tenantId) {
    return {};
  }

  return {
    actorId: request.serviceAdminContext?.actor.id,
    actorName: request.serviceAdminContext?.actor.name,
    actorType: "service_admin",
    tenantId
  };
}
