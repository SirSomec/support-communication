import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { ServiceAdminSessionGuard } from "../identity/service-admin-session.guard.js";
import { RequireServiceAdminAction } from "../identity/service-admin-auth.js";
import { WorkspaceService } from "./workspace.service.js";

@ApiTags("clients")
@UseGuards(ServiceAdminSessionGuard)
@Controller("clients")
export class ClientsController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @Get()
  @RequireServiceAdminAction("clients.read")
  @ApiOkResponse({ description: "Client profile list envelope with merge graph" })
  fetchClientProfiles(@Query() filters: { maskSensitive?: string; page?: string; pageSize?: string; segmentId?: string }): Promise<unknown> {
    return this.workspaceService.fetchClientProfiles(filters);
  }

  @Get("segments")
  @RequireServiceAdminAction("clients.read")
  @ApiOkResponse({ description: "Client segment descriptor envelope" })
  fetchClientSegments(): Promise<unknown> {
    return this.workspaceService.fetchClientSegments();
  }

  @Post("exports")
  @RequireServiceAdminAction("clients.read")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Client export job descriptor envelope" })
  createClientExport(@Body() payload: { format?: string; reason?: string; segmentId?: string }): Promise<unknown> {
    return this.workspaceService.createClientExport(payload);
  }

  @Post("merge")
  @RequireServiceAdminAction("clients.merge")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Client merge audit descriptor envelope" })
  mergeClientProfiles(@Body() payload: { candidateProfileId: string; primaryProfileId: string; reason?: string }): Promise<unknown> {
    return this.workspaceService.mergeClientProfiles(payload);
  }

  @Post("unmerge")
  @RequireServiceAdminAction("clients.merge")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Client unmerge audit descriptor envelope" })
  unmergeClientProfile(@Body() payload: { detachedProfileId: string; primaryProfileId: string; reason?: string }): Promise<unknown> {
    return this.workspaceService.unmergeClientProfile(payload);
  }
}
