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
import { Body, Controller, HttpCode, HttpStatus, Post, Req } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { TenantProvisionService } from "./tenant-provision.service.js";
let TenantProvisionController = class TenantProvisionController {
    tenantProvisionService;
    constructor(tenantProvisionService) {
        this.tenantProvisionService = tenantProvisionService;
    }
    provisionTenant(payload, request) {
        return this.tenantProvisionService.provisionTenant(payload, request);
    }
};
__decorate([
    Post("provision"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Public onboarding tenant provisioning envelope with one-time public SDK key." }),
    __param(0, Body()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], TenantProvisionController.prototype, "provisionTenant", null);
TenantProvisionController = __decorate([
    ApiTags("tenants"),
    Controller("tenants"),
    __metadata("design:paramtypes", [TenantProvisionService])
], TenantProvisionController);
export { TenantProvisionController };
//# sourceMappingURL=tenant-provision.controller.js.map