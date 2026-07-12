import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { TenantOperatorOrServiceAdminGuard } from "../conversation/tenant-operator-or-service-admin.guard.js";
import { RequireServiceAdminAction, type ServiceAdminRequest } from "../identity/service-admin-auth.js";
import { RequireTenantOperatorPermission, type TenantOperatorRequest } from "../identity/tenant-operator-auth.js";
import { type RoutingRequestContext, RoutingService } from "./routing.service.js";

@ApiTags("routing")
@UseGuards(TenantOperatorOrServiceAdminGuard)
@Controller("routing")
export class RoutingController {
  constructor(private readonly routingService: RoutingService) {}

  @Get("workload")
  @RequireTenantOperatorPermission("routing.read")
  @RequireServiceAdminAction("routing.read")
  @ApiOkResponse({ description: "Operator workload and queue health envelope" })
  fetchWorkload(@Query() query: { channel?: string }, @Req() request: TenantOperatorRequest) {
    return this.routingService.fetchWorkload(query, routingContextFromRequest(request));
  }

  @Post("assignments")
  @RequireTenantOperatorPermission("routing.redistribute")
  @RequireServiceAdminAction("routing.redistribute")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Assignment, transfer or return-to-queue envelope" })
  createAssignment(@Body() payload: {
    action?: "assign" | "return_queue" | "transfer";
    conversationId: string;
    overrideLimit?: boolean;
    reason?: string;
    targetOperatorId?: string;
  }, @Req() request: TenantOperatorRequest) {
    return this.routingService.createAssignment(payload, routingContextFromRequest(request));
  }

  @Post("assignments/simulate")
  @RequireTenantOperatorPermission("routing.read")
  @RequireServiceAdminAction("routing.read")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Assignment simulation and explainable routing candidates envelope" })
  simulateAssignment(@Body() payload: { conversationId: string }, @Req() request: TenantOperatorRequest) {
    return this.routingService.simulateAssignment(payload, routingContextFromRequest(request));
  }

  @Post("redistribution/preview")
  @RequireTenantOperatorPermission("routing.redistribute")
  @RequireServiceAdminAction("routing.redistribute")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Batch redistribution preview with capacity conflicts and SLA impact" })
  previewRedistribution(@Body() payload: {
    idempotencyKey?: string;
    reason?: string;
    selectedQueues?: string[];
    targetRule?: string;
  }, @Req() request: TenantOperatorRequest) {
    return this.routingService.previewRedistribution(payload, routingContextFromRequest(request));
  }

  @Post("redistribution/commit")
  @RequireTenantOperatorPermission("routing.redistribute")
  @RequireServiceAdminAction("routing.redistribute")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Batch redistribution commit with audit and assignment descriptors" })
  commitRedistribution(@Body() payload: {
    idempotencyKey?: string;
    previewId?: string;
    reason?: string;
    selectedQueues?: string[];
    targetRule?: string;
  }, @Req() request: TenantOperatorRequest) {
    return this.routingService.commitRedistribution(payload, routingContextFromRequest(request));
  }

  @Post("sla/pause")
  @RequireTenantOperatorPermission("routing.redistribute")
  @RequireServiceAdminAction("routing.redistribute")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "SLA pause envelope with resume job descriptor" })
  pauseSla(@Body() payload: { conversationId: string; durationMinutes?: number | string; reason?: string }, @Req() request: TenantOperatorRequest) {
    return this.routingService.pauseSla(payload, routingContextFromRequest(request));
  }

  @Post("rescue/start")
  @RequireTenantOperatorPermission("routing.redistribute")
  @RequireServiceAdminAction("routing.redistribute")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Rescue timer start envelope" })
  startRescue(@Body() payload: { conversationId: string; durationSeconds?: number; reason?: string; source?: string }, @Req() request: TenantOperatorRequest) {
    return this.routingService.startRescue(payload, routingContextFromRequest(request));
  }

  @Post("rescue/resolve")
  @RequireTenantOperatorPermission("routing.redistribute")
  @RequireServiceAdminAction("routing.redistribute")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Rescue resolution and report descriptor envelope" })
  resolveRescue(@Body() payload: { conversationId: string; outcome?: "missed" | "returned_to_queue" | "saved"; reason?: string }, @Req() request: TenantOperatorRequest) {
    return this.routingService.resolveRescue(payload, routingContextFromRequest(request));
  }

  @Get("reports/rescue")
  @RequireTenantOperatorPermission("routing.read")
  @RequireServiceAdminAction("routing.read")
  @ApiOkResponse({ description: "Rescue report rows and export descriptor envelope" })
  fetchRescueReport(@Query() query: { period?: string }, @Req() request: TenantOperatorRequest) {
    return this.routingService.fetchRescueReport(query, routingContextFromRequest(request));
  }
}

function routingContextFromRequest(request: TenantOperatorRequest & ServiceAdminRequest): RoutingRequestContext {
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
