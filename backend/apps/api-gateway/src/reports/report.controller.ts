import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req, Res, StreamableFile, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { TenantOperatorOrServiceAdminGuard } from "../conversation/tenant-operator-or-service-admin.guard.js";
import { RequireServiceAdminAction, type ServiceAdminRequest } from "../identity/service-admin-auth.js";
import { RequireTenantOperatorPermission, type TenantOperatorRequest } from "../identity/tenant-operator-auth.js";
import type { ReportRequestContext } from "./report.service.js";
import { ReportService } from "./report.service.js";

@ApiTags("reports")
@UseGuards(TenantOperatorOrServiceAdminGuard)
@Controller("reports")
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Get("workspace")
  @RequireTenantOperatorPermission("reports.read")
  @RequireServiceAdminAction("reports.read")
  @ApiOkResponse({ description: "Report workspace read model envelope" })
  fetchReportWorkspace(@Query() query: {
    channel?: string;
    operatorId?: string;
    outcome?: string;
    period?: string;
    queueId?: string;
    resolutionOutcome?: string;
    reportType?: string;
    status?: string;
    teamId?: string;
    timezoneOffsetMinutes?: string;
    topic?: string;
  }, @Req() request: TenantOperatorRequest & ServiceAdminRequest) {
    return this.reportService.fetchReportWorkspace(query, reportContextFromServiceAdminRequest(request));
  }

  @Get("routing-activity")
  @RequireTenantOperatorPermission("reports.read")
  @RequireServiceAdminAction("reports.read")
  @ApiOkResponse({ description: "Tenant-scoped assignment and transfer activity report envelope" })
  fetchRoutingActivityReport(@Query() query: {
    channel?: string;
    eventType?: string;
    operatorId?: string;
    period?: string;
  }, @Req() request: TenantOperatorRequest & ServiceAdminRequest) {
    return this.reportService.fetchRoutingActivityReport(query, reportContextFromServiceAdminRequest(request));
  }

  @Post("exports")
  @RequireTenantOperatorPermission("reports.export")
  @RequireServiceAdminAction("reports.export")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Queued report export envelope" })
  requestReportExport(@Body() payload: {
    channel?: string;
    columns?: string[];
    filters?: Record<string, unknown>;
    format?: string;
    idempotencyKey?: string;
    period?: string;
    reportType?: string;
  }, @Req() request: TenantOperatorRequest & ServiceAdminRequest) {
    return this.reportService.requestReportExport(payload, reportContextFromServiceAdminRequest(request));
  }

  @Post("templates")
  @RequireTenantOperatorPermission("reports.write")
  @RequireServiceAdminAction("reports.write")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Saved report template envelope" })
  saveSavedReportTemplate(@Body() payload: {
    columns?: string[];
    filters?: Record<string, unknown>;
    idempotencyKey?: string;
    name?: string;
    reportType?: string;
    visibility?: {
      permissions?: string[];
      roles?: string[];
      scope: "private" | "roles" | "permissions";
    };
  }, @Req() request: TenantOperatorRequest & ServiceAdminRequest) {
    return this.reportService.saveSavedReportTemplate(payload, reportContextFromServiceAdminRequest(request));
  }

  @Get("templates/:templateId")
  @RequireTenantOperatorPermission("reports.read")
  @RequireServiceAdminAction("reports.read")
  @ApiOkResponse({ description: "Saved report template detail envelope" })
  getSavedReportTemplate(@Param("templateId") templateId: string, @Req() request: TenantOperatorRequest & ServiceAdminRequest) {
    return this.reportService.getSavedReportTemplate(templateId, reportContextFromServiceAdminRequest(request));
  }

  @Post("exports/:jobId/retry")
  @RequireTenantOperatorPermission("reports.export")
  @RequireServiceAdminAction("reports.export")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Retry report export envelope" })
  retryReportExport(@Param("jobId") jobId: string, @Body() payload: { reason?: string } = {}, @Req() request: TenantOperatorRequest & ServiceAdminRequest) {
    return this.reportService.retryReportExport({ jobId, reason: payload.reason }, reportContextFromServiceAdminRequest(request));
  }

  @Get("exports/:jobId/file")
  @RequireTenantOperatorPermission("reports.export")
  @RequireServiceAdminAction("reports.export")
  @ApiOkResponse({ description: "Permission-aware report file descriptor envelope" })
  getExportFileDescriptor(@Param("jobId") jobId: string, @Req() request: TenantOperatorRequest & ServiceAdminRequest) {
    return this.reportService.getExportFileDescriptor(jobId, { canDownload: true, ...reportContextFromServiceAdminRequest(request) });
  }

  @Get("exports/:jobId/download")
  @RequireTenantOperatorPermission("reports.export")
  @RequireServiceAdminAction("reports.export")
  @ApiOkResponse({ description: "Permission-aware report export file download" })
  async downloadExportFile(
    @Param("jobId") jobId: string,
    @Req() request: TenantOperatorRequest & ServiceAdminRequest,
    @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void }
  ) {
    const envelope = await this.reportService.getExportFileDownload(jobId, { canDownload: true, ...reportContextFromServiceAdminRequest(request) });
    if (envelope.status !== "ok") {
      return envelope;
    }

    response.setHeader("Content-Type", String(envelope.data.contentType));
    response.setHeader("Content-Length", String(envelope.data.sizeBytes));
    response.setHeader("Content-Disposition", `attachment; filename="${downloadFileNameHeader(String(envelope.data.fileName))}"`);
    return new StreamableFile(envelope.data.body as Buffer);
  }
}

function reportContextFromServiceAdminRequest(request: TenantOperatorRequest & ServiceAdminRequest): ReportRequestContext {
  return {
    ...(request.tenantOperatorContext?.tenantId
      ? { tenantId: request.tenantOperatorContext.tenantId }
      : request.serviceAdminContext?.currentTenantId
        ? { tenantId: request.serviceAdminContext.currentTenantId }
        : {}),
    ...(request.tenantOperatorContext?.userId
      ? { requesterUserId: request.tenantOperatorContext.userId }
      : request.serviceAdminContext?.actor.id
        ? { requesterUserId: request.serviceAdminContext.actor.id }
        : {}),
    requesterPermissions: request.tenantOperatorContext?.permissions ?? request.serviceAdminContext?.permissions ?? [],
    requesterRoles: request.serviceAdminContext?.roles ?? []
  };
}

function downloadFileNameHeader(fileName: string): string {
  return fileName.replace(/["\r\n]/g, "_");
}
