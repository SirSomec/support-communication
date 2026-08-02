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
import { Body, Controller, Get, HttpCode, HttpStatus, Post, Put, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { RequireServiceAdminAction } from "../identity/service-admin-auth.js";
import { ServiceAdminSessionGuard } from "../identity/service-admin-session.guard.js";
import { MailSettingsService } from "./mail-settings.service.js";
// Служебная почта — платформенная настройка: управляется исключительно
// администратором сервиса, распространяется на рассылки всех воркспейсов.
let MailSettingsController = class MailSettingsController {
    mailSettingsService;
    constructor(mailSettingsService) {
        this.mailSettingsService = mailSettingsService;
    }
    fetchMailSettings() {
        return this.mailSettingsService.fetch();
    }
    saveMailSettings(payload) {
        return this.mailSettingsService.save(payload ?? {});
    }
    testMailSettings(payload = {}) {
        return this.mailSettingsService.sendTest(payload ?? {});
    }
};
__decorate([
    Get(),
    RequireServiceAdminAction("settings.read"),
    ApiOperation({ operationId: "fetchServiceMailSettings", summary: "Read service mail settings" }),
    ApiOkResponse({ description: "Mail settings envelope (password masked)" }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], MailSettingsController.prototype, "fetchMailSettings", null);
__decorate([
    Put(),
    RequireServiceAdminAction("settings.manage"),
    HttpCode(HttpStatus.OK),
    ApiOperation({ operationId: "saveServiceMailSettings", summary: "Save service mail settings" }),
    ApiOkResponse({ description: "Saved mail settings envelope (password masked)" }),
    __param(0, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], MailSettingsController.prototype, "saveMailSettings", null);
__decorate([
    Post("test"),
    RequireServiceAdminAction("settings.manage"),
    HttpCode(HttpStatus.OK),
    ApiOperation({ operationId: "testServiceMailSettings", summary: "Send a test email through saved settings" }),
    ApiOkResponse({ description: "Test outcome envelope with diagnostic code" }),
    __param(0, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], MailSettingsController.prototype, "testMailSettings", null);
MailSettingsController = __decorate([
    ApiTags("service-admin"),
    UseGuards(ServiceAdminSessionGuard),
    Controller("service-admin/mail-settings"),
    __metadata("design:paramtypes", [MailSettingsService])
], MailSettingsController);
export { MailSettingsController };
//# sourceMappingURL=mail-settings.controller.js.map