import { Body, Controller, Get, HttpCode, HttpStatus, Post, Put, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { RequireServiceAdminAction } from "../identity/service-admin-auth.js";
import { ServiceAdminSessionGuard } from "../identity/service-admin-session.guard.js";
import { MailSettingsService, type MailSettingsWriteInput } from "./mail-settings.service.js";

// Служебная почта — платформенная настройка: управляется исключительно
// администратором сервиса, распространяется на рассылки всех воркспейсов.
@ApiTags("service-admin")
@UseGuards(ServiceAdminSessionGuard)
@Controller("service-admin/mail-settings")
export class MailSettingsController {
  constructor(private readonly mailSettingsService: MailSettingsService) {}

  @Get()
  @RequireServiceAdminAction("settings.read")
  @ApiOperation({ operationId: "fetchServiceMailSettings", summary: "Read service mail settings" })
  @ApiOkResponse({ description: "Mail settings envelope (password masked)" })
  fetchMailSettings() {
    return this.mailSettingsService.fetch();
  }

  @Put()
  @RequireServiceAdminAction("settings.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "saveServiceMailSettings", summary: "Save service mail settings" })
  @ApiOkResponse({ description: "Saved mail settings envelope (password masked)" })
  saveMailSettings(@Body() payload: MailSettingsWriteInput) {
    return this.mailSettingsService.save(payload ?? {});
  }

  @Post("test")
  @RequireServiceAdminAction("settings.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "testServiceMailSettings", summary: "Send a test email through saved settings" })
  @ApiOkResponse({ description: "Test outcome envelope with diagnostic code" })
  testMailSettings(@Body() payload: { recipient?: string } = {}) {
    return this.mailSettingsService.sendTest(payload ?? {});
  }
}
