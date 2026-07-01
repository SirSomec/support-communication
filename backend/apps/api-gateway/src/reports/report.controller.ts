import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { DemoServiceAdminGuard } from "../identity/demo-service-admin.guard.js";
import { RequireServiceAdminAction, type ServiceAdminRequest } from "../identity/service-admin-auth.js";
import type { ReportRequestContext } from "./report.service.js";
import { ReportService } from "./report.service.js";

@ApiTags("reports")
@UseGuards(DemoServiceAdminGuard)
@Controller("reports")
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Get("workspace")
  @RequireServiceAdminAction("reports.read")
  @ApiOkResponse({ description: "Report workspace read model envelope" })
  fetchReportWorkspace(@Query() query: {
    channel?: string;
    period?: string;
    reportType?: string;
  }, @Req() request: ServiceAdminRequest) {
    return this.reportService.fetchReportWorkspace(query, reportContextFromServiceAdminRequest(request));
  }

  @Post("exports")
  @RequireServiceAdminAction("reports.export")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Queued report export envelope" })
  requestReportExport(@Body() payload: {
    channel?: string;
    columns?: string[];
    filters?: Record<string, unknown>;
    idempotencyKey?: string;
    period?: string;
    reportType?: string;
  }) {
    return this.reportService.requestReportExport(payload);
  }

  @Post("templates")
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
  }, @Req() request: ServiceAdminRequest) {
    return this.reportService.saveSavedReportTemplate(payload, reportContextFromServiceAdminRequest(request));
  }

  @Get("templates/:templateId")
  @RequireServiceAdminAction("reports.read")
  @ApiOkResponse({ description: "Saved report template detail envelope" })
  getSavedReportTemplate(@Param("templateId") templateId: string, @Req() request: ServiceAdminRequest) {
    return this.reportService.getSavedReportTemplate(templateId, reportContextFromServiceAdminRequest(request));
  }

  @Post("exports/:jobId/retry")
  @RequireServiceAdminAction("reports.export")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Retry report export envelope" })
  retryReportExport(@Param("jobId") jobId: string, @Body() payload: { reason?: string } = {}) {
    return this.reportService.retryReportExport({ jobId, reason: payload.reason });
  }

  @Get("exports/:jobId/file")
  @RequireServiceAdminAction("reports.export")
  @ApiOkResponse({ description: "Permission-aware report file descriptor envelope" })
  getExportFileDescriptor(@Param("jobId") jobId: string, @Req() request: ServiceAdminRequest) {
    return this.reportService.getExportFileDescriptor(jobId, { canDownload: true, ...reportContextFromServiceAdminRequest(request) });
  }
}

function reportContextFromServiceAdminRequest(request: ServiceAdminRequest): ReportRequestContext {
  return {
    ...(request.serviceAdminContext?.actor.id ? { requesterUserId: request.serviceAdminContext.actor.id } : {}),
    ...(request.serviceAdminContext?.currentTenantId ? { tenantId: request.serviceAdminContext.currentTenantId } : {}),
    requesterPermissions: request.serviceAdminContext?.permissions ?? [],
    requesterRoles: request.serviceAdminContext?.roles ?? []
  };
}
