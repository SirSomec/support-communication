import { Body, Controller, Get, HttpCode, HttpStatus, Put, Req, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { TenantOperatorOrServiceAdminGuard } from "../conversation/tenant-operator-or-service-admin.guard.js";
import { RequireServiceAdminAction, type ServiceAdminRequest } from "../identity/service-admin-auth.js";
import { RequireTenantOperatorPermission, type TenantOperatorRequest } from "../identity/tenant-operator-auth.js";
import { CurrentShiftService, type CurrentShiftPayload, type ShiftRequestContext } from "./current-shift.service.js";

@ApiTags("shifts")
@UseGuards(TenantOperatorOrServiceAdminGuard)
@Controller("shifts")
export class CurrentShiftController {
  constructor(private readonly currentShiftService: CurrentShiftService) {}

  @Get("current")
  @RequireTenantOperatorPermission("routing.redistribute")
  @RequireServiceAdminAction("routing.redistribute")
  @ApiOkResponse({ description: "Current tenant shift configuration envelope" })
  fetchCurrent(@Req() request: TenantOperatorRequest & ServiceAdminRequest) {
    return this.currentShiftService.fetchCurrentShift(shiftContextFromRequest(request));
  }

  @Put("current")
  @RequireTenantOperatorPermission("routing.redistribute")
  @RequireServiceAdminAction("routing.redistribute")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Saved current tenant shift configuration envelope with realtime event descriptor" })
  saveCurrent(
    @Body() payload: CurrentShiftPayload | null | undefined,
    @Req() request: TenantOperatorRequest & ServiceAdminRequest
  ) {
    return this.currentShiftService.saveCurrentShift(payload, shiftContextFromRequest(request));
  }
}

function shiftContextFromRequest(request: TenantOperatorRequest & ServiceAdminRequest): ShiftRequestContext {
  const tenantId = request.tenantOperatorContext?.tenantId ?? request.serviceAdminContext?.currentTenantId;
  if (!tenantId) {
    return {};
  }
  if (request.tenantOperatorContext) {
    return {
      actorId: request.tenantOperatorContext.userId,
      actorType: "operator",
      tenantId
    };
  }
  return {
    actorId: request.serviceAdminContext?.actor.id,
    actorName: request.serviceAdminContext?.actor.name,
    actorType: "service_admin",
    tenantId
  };
}
