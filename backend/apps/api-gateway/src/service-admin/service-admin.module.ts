import { Module } from "@nestjs/common";
import { ServiceAdminSessionGuard } from "../identity/service-admin-session.guard.js";
import { MailSettingsController } from "../mail/mail-settings.controller.js";
import { MailSettingsService } from "../mail/mail-settings.service.js";
import { ServiceAdminController } from "./service-admin.controller.js";
import { ServiceAdminService } from "./service-admin.service.js";

@Module({
  controllers: [MailSettingsController, ServiceAdminController],
  providers: [MailSettingsService, ServiceAdminService, ServiceAdminSessionGuard],
  exports: [ServiceAdminService]
})
export class ServiceAdminModule {}
