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
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { ServiceAdminSessionGuard } from "../identity/service-admin-session.guard.js";
import { RequireServiceAdminAction } from "../identity/service-admin-auth.js";
import { changeTenantTariffFromRoute } from "./billing.route.js";
import { BillingService } from "./billing.service.js";
let BillingController = class BillingController {
    billingService;
    constructor(billingService) {
        this.billingService = billingService;
    }
    fetchTariffs() {
        return this.billingService.fetchTariffs();
    }
    previewTariffChange(payload) {
        return this.billingService.previewTariffChange(payload);
    }
    previewTenantTariffChange(tenantId, payload) {
        return this.billingService.previewTariffChange({ ...payload, tenantId });
    }
    changeTenantTariff(tenantId, payload, request) {
        return changeTenantTariffFromRoute(this.billingService, { ...payload, tenantId }, request);
    }
    patchTenantTariff(tenantId, payload, request) {
        return changeTenantTariffFromRoute(this.billingService, { ...payload, tenantId }, request);
    }
    fetchTenantSubscription(tenantId) {
        return this.billingService.fetchTenantSubscription(tenantId);
    }
    fetchTenantInvoices(tenantId) {
        return this.billingService.fetchTenantInvoices(tenantId);
    }
    syncProviderBillingState(payload, request) {
        return this.billingService.syncProviderBillingState({ ...payload, actor: request.serviceAdminContext?.actor });
    }
    checkQuota(payload) {
        return this.billingService.checkQuota(payload);
    }
    reserveQuota(payload) {
        return this.billingService.reserveQuota(payload);
    }
    commitQuotaReservation(reservationId, payload) {
        return this.billingService.commitQuotaReservation({ ...payload, reservationId });
    }
    releaseQuotaReservation(reservationId, payload) {
        return this.billingService.releaseQuotaReservation({ ...payload, reservationId });
    }
};
__decorate([
    Get("tariffs"),
    RequireServiceAdminAction("billing.read"),
    ApiOkResponse({ description: "Billing tariff catalog envelope" }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], BillingController.prototype, "fetchTariffs", null);
__decorate([
    Post("tariff-preview"),
    RequireServiceAdminAction("billing.change"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Tariff change preview envelope" }),
    __param(0, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], BillingController.prototype, "previewTariffChange", null);
__decorate([
    Post("tenants/:tenantId/tariff-change/preview"),
    RequireServiceAdminAction("billing.change"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Tariff change preview envelope" }),
    __param(0, Param("tenantId")),
    __param(1, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], BillingController.prototype, "previewTenantTariffChange", null);
__decorate([
    Post("tenants/:tenantId/tariff-change"),
    RequireServiceAdminAction("billing.change"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Audited tariff change envelope" }),
    __param(0, Param("tenantId")),
    __param(1, Body()),
    __param(2, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], BillingController.prototype, "changeTenantTariff", null);
__decorate([
    Patch("tenants/:tenantId/tariff"),
    RequireServiceAdminAction("billing.change"),
    ApiOkResponse({ description: "Audited tariff change envelope" }),
    __param(0, Param("tenantId")),
    __param(1, Body()),
    __param(2, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], BillingController.prototype, "patchTenantTariff", null);
__decorate([
    Get("tenants/:tenantId/subscription"),
    RequireServiceAdminAction("billing.read"),
    ApiOkResponse({ description: "Tenant billing subscription envelope" }),
    __param(0, Param("tenantId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], BillingController.prototype, "fetchTenantSubscription", null);
__decorate([
    Get("tenants/:tenantId/invoices"),
    RequireServiceAdminAction("billing.read"),
    ApiOkResponse({ description: "Tenant billing invoice envelope" }),
    __param(0, Param("tenantId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], BillingController.prototype, "fetchTenantInvoices", null);
__decorate([
    Post("provider-sync"),
    RequireServiceAdminAction("billing.change"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Provider billing sync envelope" }),
    __param(0, Body()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], BillingController.prototype, "syncProviderBillingState", null);
__decorate([
    Post("quota-checks"),
    RequireServiceAdminAction("quotas.check"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Quota enforcement check envelope" }),
    __param(0, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], BillingController.prototype, "checkQuota", null);
__decorate([
    Post("reservations"),
    RequireServiceAdminAction("quotas.check"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Quota reservation envelope" }),
    __param(0, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], BillingController.prototype, "reserveQuota", null);
__decorate([
    Post("reservations/:reservationId/commit"),
    RequireServiceAdminAction("quotas.check"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Quota reservation commit envelope" }),
    __param(0, Param("reservationId")),
    __param(1, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], BillingController.prototype, "commitQuotaReservation", null);
__decorate([
    Post("reservations/:reservationId/release"),
    RequireServiceAdminAction("quotas.check"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Quota reservation release envelope" }),
    __param(0, Param("reservationId")),
    __param(1, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], BillingController.prototype, "releaseQuotaReservation", null);
BillingController = __decorate([
    ApiTags("billing"),
    UseGuards(ServiceAdminSessionGuard),
    Controller("billing"),
    __metadata("design:paramtypes", [BillingService])
], BillingController);
export { BillingController };
let PublicBillingCatalogController = class PublicBillingCatalogController {
    billingService;
    constructor(billingService) {
        this.billingService = billingService;
    }
    fetchTariffs() {
        return this.billingService.fetchTariffs();
    }
};
__decorate([
    Get("tariffs"),
    ApiOkResponse({ description: "Public canonical tariff catalog envelope" }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], PublicBillingCatalogController.prototype, "fetchTariffs", null);
PublicBillingCatalogController = __decorate([
    ApiTags("public"),
    Controller("public/catalog"),
    __metadata("design:paramtypes", [BillingService])
], PublicBillingCatalogController);
export { PublicBillingCatalogController };
let QuotaController = class QuotaController {
    billingService;
    constructor(billingService) {
        this.billingService = billingService;
    }
    fetchTenantQuotaSnapshot(tenantId) {
        return this.billingService.fetchTenantQuotaSnapshot(tenantId);
    }
    checkQuota(payload) {
        return this.billingService.checkQuota(payload);
    }
};
__decorate([
    Get("tenants/:tenantId"),
    RequireServiceAdminAction("quotas.read"),
    ApiOkResponse({ description: "Tenant quota snapshot envelope" }),
    __param(0, Param("tenantId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], QuotaController.prototype, "fetchTenantQuotaSnapshot", null);
__decorate([
    Post("check"),
    RequireServiceAdminAction("quotas.check"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Quota enforcement check envelope" }),
    __param(0, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], QuotaController.prototype, "checkQuota", null);
QuotaController = __decorate([
    ApiTags("quotas"),
    UseGuards(ServiceAdminSessionGuard),
    Controller("quotas"),
    __metadata("design:paramtypes", [BillingService])
], QuotaController);
export { QuotaController };
//# sourceMappingURL=billing.controller.js.map