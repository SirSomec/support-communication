import { Body, Controller, Get, HttpCode, HttpStatus, Post, Put, Req, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { TenantOperatorOrServiceAdminGuard } from "../conversation/tenant-operator-or-service-admin.guard.js";
import { RequireServiceAdminAction, type ServiceAdminRequest } from "../identity/service-admin-auth.js";
import { RequireTenantOperatorPermission, type TenantOperatorRequest } from "../identity/tenant-operator-auth.js";
import { MailSettingsService, type MailSettingsWriteInput } from "./mail-settings.service.js";

@ApiTags("workspace")
@UseGuards(TenantOperatorOrServiceAdminGuard)
@Controller("workspace/mail-settings")
export class MailSettingsController {
  constructor(private readonly mailSettingsService: MailSettingsService) {}

  @Get()
  @RequireTenantOperatorPermission("settings.read")
  @RequireServiceAdminAction("settings.read")
  @ApiOperation({ operationId: "fetchWorkspaceMailSettings", summary: "Read workspace service mail settings" })
  @ApiOkResponse({ description: "Mail settings envelope (password masked)" })
  fetchMailSettings(@Req() request: MailSettingsRequest) {
    return this.mailSettingsService.fetch(mailSettingsTenantScope(request).tenantId);
  }

  @Put()
  @RequireTenantOperatorPermission("settings.manage")
  @RequireServiceAdminAction("settings.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "saveWorkspaceMailSettings", summary: "Save workspace service mail settings" })
  @ApiOkResponse({ description: "Saved mail settings envelope (password masked)" })
  saveMailSettings(@Body() payload: MailSettingsWriteInput, @Req() request: MailSettingsRequest) {
    return this.mailSettingsService.save(mailSettingsTenantScope(request).tenantId, payload ?? {});
  }

  @Post("test")
  @RequireTenantOperatorPermission("settings.manage")
  @RequireServiceAdminAction("settings.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "testWorkspaceMailSettings", summary: "Send a test email through saved settings" })
  @ApiOkResponse({ description: "Test outcome envelope with diagnostic code" })
  testMailSettings(@Body() payload: { recipient?: string } = {}, @Req() request: MailSettingsRequest) {
    return this.mailSettingsService.sendTest(mailSettingsTenantScope(request).tenantId, payload ?? {});
  }
}

type MailSettingsRequest = TenantOperatorRequest & ServiceAdminRequest;

function mailSettingsTenantScope(request: MailSettingsRequest): { tenantId: string } {
  const tenantId = request.tenantOperatorContext?.tenantId ?? request.serviceAdminContext?.currentTenantId;
  if (!tenantId) {
    throw new Error("mail_settings_tenant_id_required");
  }
  return { tenantId };
}
