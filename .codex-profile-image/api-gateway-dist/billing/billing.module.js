var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Module } from "@nestjs/common";
import { ServiceAdminSessionGuard } from "../identity/service-admin-session.guard.js";
import { BillingController, PublicBillingCatalogController, QuotaController } from "./billing.controller.js";
import { BillingService } from "./billing.service.js";
let BillingModule = class BillingModule {
};
BillingModule = __decorate([
    Module({
        controllers: [BillingController, PublicBillingCatalogController, QuotaController],
        providers: [BillingService, ServiceAdminSessionGuard],
        exports: [BillingService]
    })
], BillingModule);
export { BillingModule };
//# sourceMappingURL=billing.module.js.map