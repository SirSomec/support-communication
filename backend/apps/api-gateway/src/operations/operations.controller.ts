import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { DemoServiceAdminGuard } from "../identity/demo-service-admin.guard.js";
import { RequireServiceAdminAction, type ServiceAdminRequest } from "../identity/service-admin-auth.js";
import { OperationsReadinessService } from "./operations-readiness.service.js";

interface OperationBody {
  confirmed?: boolean;
  idempotencyKey?: string;
  reason?: string;
}

@ApiTags("operations")
@UseGuards(DemoServiceAdminGuard)
@Controller("operations")
export class OperationsController {
  constructor(private readonly operationsReadinessService: OperationsReadinessService) {}

  @Get("readiness")
  @RequireServiceAdminAction("operations.read")
  @ApiOkResponse({ description: "Production readiness dashboard envelope" })
  fetchReadinessDashboard(@Query() query: { domain?: string }) {
    return this.operationsReadinessService.fetchReadinessDashboard(query);
  }

  @Post("load-tests/:scenarioId/runs")
  @RequireServiceAdminAction("operations.write")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Queued load test run envelope" })
  queueLoadTestRun(@Param("scenarioId") scenarioId: string, @Body() payload: OperationBody, @Req() request: ServiceAdminRequest) {
    return this.operationsReadinessService.queueLoadTestRun({ ...payload, actor: request.serviceAdminContext?.actor, scenarioId });
  }

  @Post("backup-drills/:drillId/restore-checks")
  @RequireServiceAdminAction("operations.write")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Queued restore drill check envelope" })
  queueRestoreCheck(@Param("drillId") drillId: string, @Body() payload: OperationBody, @Req() request: ServiceAdminRequest) {
    return this.operationsReadinessService.queueRestoreCheck({ ...payload, actor: request.serviceAdminContext?.actor, drillId });
  }

  @Get("dead-letter")
  @RequireServiceAdminAction("operations.read")
  @ApiOkResponse({ description: "Dead-letter dashboard envelope" })
  fetchDeadLetterDashboard(@Query() query: { queue?: string }) {
    return this.operationsReadinessService.fetchDeadLetterDashboard(query);
  }

  @Post("dead-letter/:messageId/replay")
  @RequireServiceAdminAction("operations.write")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Dead-letter replay queue envelope" })
  replayDeadLetterMessage(@Param("messageId") messageId: string, @Body() payload: OperationBody, @Req() request: ServiceAdminRequest) {
    return this.operationsReadinessService.replayDeadLetterMessage({ ...payload, actor: request.serviceAdminContext?.actor, messageId });
  }

  @Post("migrations/:migrationId/rollback-check")
  @RequireServiceAdminAction("operations.write")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Migration rollback compatibility envelope" })
  checkMigrationRollback(@Param("migrationId") migrationId: string, @Body() payload: OperationBody, @Req() request: ServiceAdminRequest) {
    return this.operationsReadinessService.checkMigrationRollback({ ...payload, actor: request.serviceAdminContext?.actor, migrationId });
  }

  @Get("security-review")
  @RequireServiceAdminAction("security.review")
  @ApiOkResponse({ description: "Security review controls envelope" })
  fetchSecurityReview(@Query() query: { area?: string }) {
    return this.operationsReadinessService.fetchSecurityReview(query);
  }
}
