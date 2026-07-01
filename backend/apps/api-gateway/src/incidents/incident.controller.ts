import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { DemoServiceAdminGuard } from "../identity/demo-service-admin.guard.js";
import { RequireServiceAdminAction, type ServiceAdminRequest } from "../identity/service-admin-auth.js";
import { IncidentService } from "./incident.service.js";

@ApiTags("incidents")
@UseGuards(DemoServiceAdminGuard)
@Controller("incidents")
export class IncidentController {
  constructor(private readonly incidentService: IncidentService) {}

  @Get()
  @RequireServiceAdminAction("incidents.read")
  @ApiOkResponse({ description: "Incident list envelope" })
  fetchIncidents(@Query() filters: { componentId?: string; severity?: string; status?: string; tenantId?: string }) {
    return this.incidentService.fetchIncidents(filters);
  }

  @Get(":incidentId")
  @RequireServiceAdminAction("incidents.read")
  @ApiOkResponse({ description: "Incident detail envelope" })
  fetchIncidentDetail(@Param("incidentId") incidentId: string) {
    return this.incidentService.fetchIncidentDetail(incidentId);
  }

  @Post(":incidentId/updates")
  @RequireServiceAdminAction("incidents.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Incident timeline update envelope" })
  addIncidentUpdate(
    @Param("incidentId") incidentId: string,
    @Body()
    payload: {
      confirmed?: boolean;
      customerVisible?: boolean;
      idempotencyKey?: string;
      message?: string;
      reason?: string;
      status?: "identified" | "investigating" | "monitoring" | "resolved";
    },
    @Req() request: ServiceAdminRequest
  ) {
    return this.incidentService.addIncidentUpdate({
      ...payload,
      actor: request.serviceAdminContext?.actor,
      incidentId
    });
  }
}
