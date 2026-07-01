import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { DemoServiceAdminGuard } from "../identity/demo-service-admin.guard.js";
import { RequireServiceAdminAction, type ServiceAdminRequest } from "../identity/service-admin-auth.js";
import { PlatformMonitoringService } from "./platform-monitoring.service.js";

@ApiTags("platform")
@UseGuards(DemoServiceAdminGuard)
@Controller("platform")
export class PlatformController {
  constructor(private readonly platformMonitoringService: PlatformMonitoringService) {}

  @Get("snapshot")
  @RequireServiceAdminAction("platform.read")
  @ApiOkResponse({ description: "Platform health and metric snapshot envelope" })
  fetchPlatformSnapshot(@Query() filters: { region?: string; status?: string }) {
    return this.platformMonitoringService.fetchPlatformSnapshot(filters);
  }

  @Get("components/:componentId")
  @RequireServiceAdminAction("platform.read")
  @ApiOkResponse({ description: "Platform component drilldown envelope" })
  fetchComponentDrilldown(@Param("componentId") componentId: string) {
    return this.platformMonitoringService.fetchComponentDrilldown(componentId);
  }

  @Post("components/:componentId/acknowledgements")
  @RequireServiceAdminAction("platform.alert.acknowledge")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Platform alert acknowledgement envelope" })
  acknowledgeComponentAlert(
    @Param("componentId") componentId: string,
    @Body() payload: { confirmed?: boolean; idempotencyKey?: string; reason?: string },
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: ServiceAdminRequest
  ) {
    return this.platformMonitoringService.acknowledgeComponentAlert({
      ...payload,
      actor: request.serviceAdminContext?.actor,
      componentId,
      idempotencyKey: idempotencyKey ?? payload.idempotencyKey
    });
  }

  @Post("telemetry/samples")
  @RequireServiceAdminAction("platform.telemetry.ingest")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Platform telemetry sample ingestion envelope" })
  ingestTelemetrySample(
    @Body() payload: {
      componentId?: string;
      id?: string;
      metricKey?: string;
      sampledAt?: string;
      source?: string;
      tags?: Record<string, unknown>;
      tenantId?: string | null;
      unit?: string;
      value?: number;
    }
  ) {
    return this.platformMonitoringService.ingestTelemetrySample(payload);
  }

  @Post("health-rollups")
  @RequireServiceAdminAction("platform.health-rollups.write")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Platform component health rollup write envelope" })
  writeHealthRollup(
    @Body() payload: {
      availability?: number;
      componentId?: string;
      errorRate?: number;
      generatedAt?: string;
      id?: string;
      incidentIds?: string[];
      latencyP95Ms?: number;
      sampleCount?: number;
      status?: string;
      windowEnd?: string;
      windowStart?: string;
    }
  ) {
    return this.platformMonitoringService.writeHealthRollup(payload);
  }

  @Post("alert-routing/rules")
  @RequireServiceAdminAction("platform.alert-routing.write")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Platform alert routing rule persistence envelope" })
  saveAlertRoutingRule(
    @Body() payload: {
      componentIds?: string[];
      destination?: {
        channel?: string;
        target?: string;
      };
      enabled?: boolean;
      ruleId?: string;
      severities?: string[];
      statuses?: string[];
    }
  ) {
    return this.platformMonitoringService.saveAlertRoutingRule(payload);
  }
}

@ApiTags("platform-monitoring")
@UseGuards(DemoServiceAdminGuard)
@Controller("platform-monitoring")
export class PlatformMonitoringAliasController {
  constructor(private readonly platformMonitoringService: PlatformMonitoringService) {}

  @Get("snapshot")
  @RequireServiceAdminAction("platform.read")
  @ApiOkResponse({ description: "Platform health and metric snapshot envelope" })
  fetchPlatformSnapshot(@Query() filters: { region?: string; status?: string }) {
    return this.platformMonitoringService.fetchPlatformSnapshot(filters);
  }

  @Get("components/:componentId")
  @RequireServiceAdminAction("platform.read")
  @ApiOkResponse({ description: "Platform component drilldown envelope" })
  fetchComponentDrilldown(@Param("componentId") componentId: string) {
    return this.platformMonitoringService.fetchComponentDrilldown(componentId);
  }

  @Post("components/:componentId/acknowledgements")
  @RequireServiceAdminAction("platform.alert.acknowledge")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Platform alert acknowledgement envelope" })
  acknowledgeComponentAlert(
    @Param("componentId") componentId: string,
    @Body() payload: { confirmed?: boolean; idempotencyKey?: string; reason?: string },
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: ServiceAdminRequest
  ) {
    return this.platformMonitoringService.acknowledgeComponentAlert({
      ...payload,
      actor: request.serviceAdminContext?.actor,
      componentId,
      idempotencyKey: idempotencyKey ?? payload.idempotencyKey
    });
  }

  @Post("telemetry/samples")
  @RequireServiceAdminAction("platform.telemetry.ingest")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Platform telemetry sample ingestion envelope" })
  ingestTelemetrySample(
    @Body() payload: {
      componentId?: string;
      id?: string;
      metricKey?: string;
      sampledAt?: string;
      source?: string;
      tags?: Record<string, unknown>;
      tenantId?: string | null;
      unit?: string;
      value?: number;
    }
  ) {
    return this.platformMonitoringService.ingestTelemetrySample(payload);
  }

  @Post("health-rollups")
  @RequireServiceAdminAction("platform.health-rollups.write")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Platform component health rollup write envelope" })
  writeHealthRollup(
    @Body() payload: {
      availability?: number;
      componentId?: string;
      errorRate?: number;
      generatedAt?: string;
      id?: string;
      incidentIds?: string[];
      latencyP95Ms?: number;
      sampleCount?: number;
      status?: string;
      windowEnd?: string;
      windowStart?: string;
    }
  ) {
    return this.platformMonitoringService.writeHealthRollup(payload);
  }

  @Post("alert-routing/rules")
  @RequireServiceAdminAction("platform.alert-routing.write")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Platform alert routing rule persistence envelope" })
  saveAlertRoutingRule(
    @Body() payload: {
      componentIds?: string[];
      destination?: {
        channel?: string;
        target?: string;
      };
      enabled?: boolean;
      ruleId?: string;
      severities?: string[];
      statuses?: string[];
    }
  ) {
    return this.platformMonitoringService.saveAlertRoutingRule(payload);
  }
}
