import { Body, CanActivate, Controller, ExecutionContext, Get, Headers, HttpCode, HttpStatus, Injectable, Param, Post, Req, UnauthorizedException, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { ServiceAdminSessionGuard } from "../identity/service-admin-session.guard.js";
import { RequireServiceAdminAction, type ServiceAdminRequest } from "../identity/service-admin-auth.js";
import { type WorkspaceRequestContext, WorkspaceService } from "./workspace.service.js";

@ApiTags("files")
@UseGuards(ServiceAdminSessionGuard)
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

  @Get(":fileId/download-policy")
  @RequireServiceAdminAction("files.read")
  @ApiOkResponse({ description: "Permission-aware file download policy envelope" })
  getDownloadPolicy(@Param("fileId") fileId: string, @Req() request: ServiceAdminRequest): Promise<unknown> {
    return this.workspaceService.getDownloadPolicy(fileId, { canDownload: true, ...tenantContextFromServiceAdminRequest(request) });
  }
}

@Injectable()
class FileScanCallbackGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const expected = String(process.env.FILE_SCAN_CALLBACK_TOKEN ?? "").trim();
    const provided = request.headers["x-file-scan-callback-token"];
    const token = Array.isArray(provided) ? provided[0] : provided;
    if (!expected || token !== expected) throw new UnauthorizedException("File scan callback token is required.");
    return true;
  }
}

@ApiTags("files")
@Controller("files")
export class FileScanCallbackController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @Post(":fileId/scan-result")
  @UseGuards(FileScanCallbackGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Record antivirus scan result from the internal scanner" })
  recordScanResult(
    @Param("fileId") fileId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() payload: { checkedAt?: string; idempotencyKey?: string; reason?: string; scanner?: string; verdict: "clean" | "error" | "infected" }
  ): Promise<unknown> {
    return this.workspaceService.recordScanResult({ ...payload, fileId, idempotencyKey: idempotencyKey ?? payload.idempotencyKey });
  }
}

function tenantContextFromServiceAdminRequest(request: ServiceAdminRequest): WorkspaceRequestContext {
  return request.serviceAdminContext?.currentTenantId ? { tenantId: request.serviceAdminContext.currentTenantId } : {};
}
