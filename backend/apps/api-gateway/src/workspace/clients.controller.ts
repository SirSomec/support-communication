import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { DemoServiceAdminGuard } from "../identity/demo-service-admin.guard.js";
import { RequireServiceAdminAction } from "../identity/service-admin-auth.js";
import { WorkspaceService } from "./workspace.service.js";

@ApiTags("clients")
@UseGuards(DemoServiceAdminGuard)
@Controller("clients")
export class ClientsController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @Get()
  @RequireServiceAdminAction("clients.read")
  @ApiOkResponse({ description: "Client profile list envelope with merge graph" })
  fetchClientProfiles(@Query() filters: { maskSensitive?: string; page?: string; pageSize?: string }): Promise<unknown> {
    return this.workspaceService.fetchClientProfiles(filters);
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
