import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { RoutingService } from "./routing.service.js";

@ApiTags("routing")
@Controller("routing")
export class RoutingController {
  constructor(private readonly routingService: RoutingService) {}

  @Get("workload")
  @ApiOkResponse({ description: "Operator workload and queue health envelope" })
  fetchWorkload(@Query() query: { channel?: string }) {
    return this.routingService.fetchWorkload(query);
  }

  @Post("assignments")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Assignment, transfer or return-to-queue envelope" })
  createAssignment(@Body() payload: {
    action?: "assign" | "return_queue" | "transfer";
    conversationId: string;
    overrideLimit?: boolean;
    reason?: string;
    targetOperatorId?: string;
  }) {
    return this.routingService.createAssignment(payload);
  }

  @Post("assignments/simulate")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Assignment simulation and explainable routing candidates envelope" })
  simulateAssignment(@Body() payload: { conversationId: string }) {
    return this.routingService.simulateAssignment(payload);
  }

  @Post("sla/pause")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "SLA pause envelope with resume job descriptor" })
  pauseSla(@Body() payload: { conversationId: string; durationMinutes?: number | string; reason?: string }) {
    return this.routingService.pauseSla(payload);
  }

  @Post("rescue/start")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Rescue timer start envelope" })
  startRescue(@Body() payload: { conversationId: string; durationSeconds?: number; reason?: string; source?: string }) {
    return this.routingService.startRescue(payload);
  }

  @Post("rescue/resolve")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Rescue resolution and report descriptor envelope" })
  resolveRescue(@Body() payload: { conversationId: string; outcome?: "missed" | "returned_to_queue" | "saved"; reason?: string }) {
    return this.routingService.resolveRescue(payload);
  }

  @Get("reports/rescue")
  @ApiOkResponse({ description: "Rescue report rows and export descriptor envelope" })
  fetchRescueReport(@Query() query: { period?: string }) {
    return this.routingService.fetchRescueReport(query);
  }
}
