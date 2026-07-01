import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { DemoServiceAdminGuard } from "../identity/demo-service-admin.guard.js";
import { RequireServiceAdminAction, type ServiceAdminRequest } from "../identity/service-admin-auth.js";
import { type WorkspaceRequestContext, WorkspaceService } from "./workspace.service.js";

@ApiTags("files")
@UseGuards(DemoServiceAdminGuard)
@Controller("files")
export class FilesController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @Post("uploads")
  @RequireServiceAdminAction("files.write")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "File upload descriptor envelope" })
  createUploadDescriptor(
    @Body() payload: { channel: string; fileName: string; mimeType?: string; sizeBytes?: number },
    @Req() request: ServiceAdminRequest
  ): Promise<unknown> {
    return this.workspaceService.createUploadDescriptor(payload, tenantContextFromServiceAdminRequest(request));
  }

  @Post(":fileId/finalize")
  @RequireServiceAdminAction("files.write")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Finalize upload and scan state envelope" })
  finalizeUpload(
    @Param("fileId") fileId: string,
    @Body() payload: { checksum?: string },
    @Req() request: ServiceAdminRequest
  ): Promise<unknown> {
    return this.workspaceService.finalizeUpload({ ...payload, fileId }, tenantContextFromServiceAdminRequest(request));
  }

  @Post(":fileId/scan-result")
  @RequireServiceAdminAction("files.write")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Record antivirus scan result and update file download readiness envelope" })
  recordScanResult(
    @Param("fileId") fileId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() payload: { checkedAt?: string; idempotencyKey?: string; reason?: string; scanner?: string; verdict: "clean" | "error" | "infected" },
    @Req() request: ServiceAdminRequest
  ): Promise<unknown> {
    return this.workspaceService.recordScanResult(
      { ...payload, fileId, idempotencyKey: idempotencyKey ?? payload.idempotencyKey },
      tenantContextFromServiceAdminRequest(request)
    );
  }

  @Get(":fileId/download-policy")
  @RequireServiceAdminAction("files.read")
  @ApiOkResponse({ description: "Permission-aware file download policy envelope" })
  getDownloadPolicy(@Param("fileId") fileId: string, @Req() request: ServiceAdminRequest): Promise<unknown> {
    return this.workspaceService.getDownloadPolicy(fileId, { canDownload: true, ...tenantContextFromServiceAdminRequest(request) });
  }
}

function tenantContextFromServiceAdminRequest(request: ServiceAdminRequest): WorkspaceRequestContext {
  return request.serviceAdminContext?.currentTenantId ? { tenantId: request.serviceAdminContext.currentTenantId } : {};
}
