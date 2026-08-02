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
import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Injectable, Param, Post, Req, UnauthorizedException, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { ServiceAdminSessionGuard } from "../identity/service-admin-session.guard.js";
import { RequireServiceAdminAction } from "../identity/service-admin-auth.js";
import { WorkspaceService } from "./workspace.service.js";
let FilesController = class FilesController {
    workspaceService;
    constructor(workspaceService) {
        this.workspaceService = workspaceService;
    }
    createUploadDescriptor(payload, request) {
        return this.workspaceService.createUploadDescriptor(payload, tenantContextFromServiceAdminRequest(request));
    }
    finalizeUpload(fileId, payload, request) {
        return this.workspaceService.finalizeUpload({ ...payload, fileId }, tenantContextFromServiceAdminRequest(request));
    }
    getDownloadPolicy(fileId, request) {
        return this.workspaceService.getDownloadPolicy(fileId, { canDownload: true, ...tenantContextFromServiceAdminRequest(request) });
    }
};
__decorate([
    Post("uploads"),
    RequireServiceAdminAction("files.write"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "File upload descriptor envelope" }),
    __param(0, Body()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], FilesController.prototype, "createUploadDescriptor", null);
__decorate([
    Post(":fileId/finalize"),
    RequireServiceAdminAction("files.write"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Finalize upload and scan state envelope" }),
    __param(0, Param("fileId")),
    __param(1, Body()),
    __param(2, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], FilesController.prototype, "finalizeUpload", null);
__decorate([
    Get(":fileId/download-policy"),
    RequireServiceAdminAction("files.read"),
    ApiOkResponse({ description: "Permission-aware file download policy envelope" }),
    __param(0, Param("fileId")),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], FilesController.prototype, "getDownloadPolicy", null);
FilesController = __decorate([
    ApiTags("files"),
    UseGuards(ServiceAdminSessionGuard),
    Controller("files"),
    __metadata("design:paramtypes", [WorkspaceService])
], FilesController);
export { FilesController };
let FileScanCallbackGuard = class FileScanCallbackGuard {
    canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const expected = String(process.env.FILE_SCAN_CALLBACK_TOKEN ?? "").trim();
        const provided = request.headers["x-file-scan-callback-token"];
        const token = Array.isArray(provided) ? provided[0] : provided;
        if (!expected || token !== expected)
            throw new UnauthorizedException("File scan callback token is required.");
        return true;
    }
};
FileScanCallbackGuard = __decorate([
    Injectable()
], FileScanCallbackGuard);
let FileScanCallbackController = class FileScanCallbackController {
    workspaceService;
    constructor(workspaceService) {
        this.workspaceService = workspaceService;
    }
    recordScanResult(fileId, idempotencyKey, payload) {
        return this.workspaceService.recordScanResult({ ...payload, fileId, idempotencyKey: idempotencyKey ?? payload.idempotencyKey });
    }
};
__decorate([
    Post(":fileId/scan-result"),
    UseGuards(FileScanCallbackGuard),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Record antivirus scan result from the internal scanner" }),
    __param(0, Param("fileId")),
    __param(1, Headers("idempotency-key")),
    __param(2, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], FileScanCallbackController.prototype, "recordScanResult", null);
FileScanCallbackController = __decorate([
    ApiTags("files"),
    Controller("files"),
    __metadata("design:paramtypes", [WorkspaceService])
], FileScanCallbackController);
export { FileScanCallbackController };
function tenantContextFromServiceAdminRequest(request) {
    return request.serviceAdminContext?.currentTenantId ? { tenantId: request.serviceAdminContext.currentTenantId } : {};
}
//# sourceMappingURL=files.controller.js.map