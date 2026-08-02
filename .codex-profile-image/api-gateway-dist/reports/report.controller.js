var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req, Res, StreamableFile, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { TenantOperatorOrServiceAdminGuard } from "../conversation/tenant-operator-or-service-admin.guard.js";
import { RequireServiceAdminAction } from "../identity/service-admin-auth.js";
import { RequireTenantOperatorPermission } from "../identity/tenant-operator-auth.js";
import { ReportService } from "./report.service.js";
let ReportController = class ReportController {
    reportService;
    constructor(reportService) {
        this.reportService = reportService;
    }
    fetchReportWorkspace(query, request) {
        return this.reportService.fetchReportWorkspace(query, reportContextFromServiceAdminRequest(request));
    }
    fetchRoutingActivityReport(query, request) {
        return this.reportService.fetchRoutingActivityReport(query, reportContextFromServiceAdminRequest(request));
    }
    requestReportExport(payload, request) {
        return this.reportService.requestReportExport(payload, reportContextFromServiceAdminRequest(request));
    }
    saveSavedReportTemplate(payload, request) {
        return this.reportService.saveSavedReportTemplate(payload, reportContextFromServiceAdminRequest(request));
    }
    getSavedReportTemplate(templateId, request) {
        return this.reportService.getSavedReportTemplate(templateId, reportContextFromServiceAdminRequest(request));
    }
    retryReportExport(jobId, payload = {}, request) {
        return this.reportService.retryReportExport({ jobId, reason: payload.reason }, reportContextFromServiceAdminRequest(request));
    }
    getExportFileDescriptor(jobId, request) {
        return this.reportService.getExportFileDescriptor(jobId, { canDownload: true, ...reportContextFromServiceAdminRequest(request) });
    }
    async downloadExportFile(jobId, request, response) {
        const envelope = await this.reportService.getExportFileDownload(jobId, { canDownload: true, ...reportContextFromServiceAdminRequest(request) });
        if (envelope.status !== "ok") {
            return envelope;
        }
        response.setHeader("Content-Type", String(envelope.data.contentType));
        response.setHeader("Content-Length", String(envelope.data.sizeBytes));
        response.setHeader("Content-Disposition", `attachment; filename="${downloadFileNameHeader(String(envelope.data.fileName))}"`);
        return new StreamableFile(envelope.data.body);
    }
};
__decorate([
    Get("workspace"),
    RequireTenantOperatorPermission("reports.read"),
    RequireServiceAdminAction("reports.read"),
    ApiOkResponse({ description: "Report workspace read model envelope" }),
    __param(0, Query()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], ReportController.prototype, "fetchReportWorkspace", null);
__decorate([
    Get("routing-activity"),
    RequireTenantOperatorPermission("reports.read"),
    RequireServiceAdminAction("reports.read"),
    ApiOkResponse({ description: "Tenant-scoped assignment and transfer activity report envelope" }),
    __param(0, Query()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], ReportController.prototype, "fetchRoutingActivityReport", null);
__decorate([
    Post("exports"),
    RequireTenantOperatorPermission("reports.export"),
    RequireServiceAdminAction("reports.export"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Queued report export envelope" }),
    __param(0, Body()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], ReportController.prototype, "requestReportExport", null);
__decorate([
    Post("templates"),
    RequireTenantOperatorPermission("reports.write"),
    RequireServiceAdminAction("reports.write"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Saved report template envelope" }),
    __param(0, Body()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], ReportController.prototype, "saveSavedReportTemplate", null);
__decorate([
    Get("templates/:templateId"),
    RequireTenantOperatorPermission("reports.read"),
    RequireServiceAdminAction("reports.read"),
    ApiOkResponse({ description: "Saved report template detail envelope" }),
    __param(0, Param("templateId")),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ReportController.prototype, "getSavedReportTemplate", null);
__decorate([
    Post("exports/:jobId/retry"),
    RequireTenantOperatorPermission("reports.export"),
    RequireServiceAdminAction("reports.export"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Retry report export envelope" }),
    __param(0, Param("jobId")),
    __param(1, Body()),
    __param(2, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ReportController.prototype, "retryReportExport", null);
__decorate([
    Get("exports/:jobId/file"),
    RequireTenantOperatorPermission("reports.export"),
    RequireServiceAdminAction("reports.export"),
    ApiOkResponse({ description: "Permission-aware report file descriptor envelope" }),
    __param(0, Param("jobId")),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ReportController.prototype, "getExportFileDescriptor", null);
__decorate([
    Get("exports/:jobId/download"),
    RequireTenantOperatorPermission("reports.export"),
    RequireServiceAdminAction("reports.export"),
    ApiOkResponse({ description: "Permission-aware report export file download" }),
    __param(0, Param("jobId")),
    __param(1, Req()),
    __param(2, Res({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], ReportController.prototype, "downloadExportFile", null);
ReportController = __decorate([
    ApiTags("reports"),
    UseGuards(TenantOperatorOrServiceAdminGuard),
    Controller("reports"),
    __metadata("design:paramtypes", [ReportService])
], ReportController);
export { ReportController };
function reportContextFromServiceAdminRequest(request) {
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
function downloadFileNameHeader(fileName) {
    return fileName.replace(/["\r\n]/g, "_");
}
//# sourceMappingURL=report.controller.js.map