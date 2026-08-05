import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { ServiceAdminSessionGuard } from "../identity/service-admin-session.guard.js";
import { RequireServiceAdminAction, type ServiceAdminRequest } from "../identity/service-admin-auth.js";
import { RequireTenantOperatorPermission, type TenantOperatorRequest } from "../identity/tenant-operator-auth.js";
import { TenantOperatorAuthGuard } from "../identity/tenant-operator-auth.guard.js";
import { type BillingInvoiceState, type BillingSubscriptionState } from "./billing.repository.js";
import { changeTenantTariffFromRoute } from "./billing.route.js";
import { BillingService } from "./billing.service.js";

interface TariffChangeBody {
  approvalId?: string;
  confirmationText?: string;
  confirmed?: boolean;
  nextPlanId?: string;
  reason?: string;
  tenantId?: string;
}

interface QuotaCheckBody {
  idempotencyKey?: string;
  mode?: string;
  requested?: unknown;
  resource?: string;
  tenantId?: string;
}

interface QuotaReservationBody {
  idempotencyKey?: string;
  requested?: unknown;
  resource?: string;
  tenantId?: string;
}

interface QuotaReservationTransitionBody {
  idempotencyKey?: string;
}

interface BalanceTopUpBody { amountKopeks?: number; idempotencyKey?: string; reason?: string; }
interface AiDialogPackageBody { idempotencyKey?: string; packageId?: string; reason?: string; }

interface ProviderSyncBody {
  approvalId?: string;
  eventType?: string;
  idempotencyKey?: string;
  invoice?: Partial<BillingInvoiceState>;
  provider?: string;
  subscription?: Partial<BillingSubscriptionState>;
  tenantId?: string;
}

@ApiTags("billing")
@UseGuards(ServiceAdminSessionGuard)
@Controller("billing")
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get("tariffs")
  @RequireServiceAdminAction("billing.read")
  @ApiOkResponse({ description: "Billing tariff catalog envelope" })
  fetchTariffs() {
    return this.billingService.fetchTariffs();
  }

  @Get("payment-provider-readiness")
  @RequireServiceAdminAction("billing.read")
  @ApiOkResponse({ description: "Safe payment-provider launch readiness without exposing credentials" })
  fetchPaymentProviderReadiness() {
    return this.billingService.fetchPaymentProviderReadiness();
  }

  @Post("tariff-preview")
  @RequireServiceAdminAction("billing.change")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Tariff change preview envelope" })
  previewTariffChange(@Body() payload: TariffChangeBody) {
    return this.billingService.previewTariffChange(payload);
  }

  @Post("tenants/:tenantId/tariff-change/preview")
  @RequireServiceAdminAction("billing.change")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Tariff change preview envelope" })
  previewTenantTariffChange(@Param("tenantId") tenantId: string, @Body() payload: TariffChangeBody) {
    return this.billingService.previewTariffChange({ ...payload, tenantId });
  }

  @Post("tenants/:tenantId/tariff-change")
  @RequireServiceAdminAction("billing.change")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Audited tariff change envelope" })
  changeTenantTariff(@Param("tenantId") tenantId: string, @Body() payload: TariffChangeBody, @Req() request: ServiceAdminRequest) {
    return changeTenantTariffFromRoute(this.billingService, { ...payload, tenantId }, request);
  }

  @Patch("tenants/:tenantId/tariff")
  @RequireServiceAdminAction("billing.change")
  @ApiOkResponse({ description: "Audited tariff change envelope" })
  patchTenantTariff(@Param("tenantId") tenantId: string, @Body() payload: TariffChangeBody, @Req() request: ServiceAdminRequest) {
    return changeTenantTariffFromRoute(this.billingService, { ...payload, tenantId }, request);
  }

  @Get("tenants/:tenantId/subscription")
  @RequireServiceAdminAction("billing.read")
  @ApiOkResponse({ description: "Tenant billing subscription envelope" })
  fetchTenantSubscription(@Param("tenantId") tenantId: string) {
    return this.billingService.fetchTenantSubscription(tenantId);
  }

  @Get("tenants/:tenantId/invoices")
  @RequireServiceAdminAction("billing.read")
  @ApiOkResponse({ description: "Tenant billing invoice envelope" })
  fetchTenantInvoices(@Param("tenantId") tenantId: string) {
    return this.billingService.fetchTenantInvoices(tenantId);
  }

  @Post("tenants/:tenantId/balance/top-ups")
  @RequireServiceAdminAction("billing.change")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Manual tenant balance top-up envelope" })
  topUpTenantBalance(@Param("tenantId") tenantId: string, @Body() payload: BalanceTopUpBody, @Req() request: ServiceAdminRequest) {
    return this.billingService.topUpTenantBalance({ ...payload, actor: request.serviceAdminContext?.actor, tenantId });
  }

  @Post("tenants/:tenantId/ai-dialog-packages/purchases")
  @RequireServiceAdminAction("billing.change")
  @HttpCode(HttpStatus.OK)
  purchaseAiDialogPackage(@Param("tenantId") tenantId: string, @Body() payload: AiDialogPackageBody, @Req() request: ServiceAdminRequest) {
    return this.billingService.purchaseAiDialogPackage({ ...payload, actor: request.serviceAdminContext?.actor, tenantId });
  }

  @Post("provider-sync")
  @RequireServiceAdminAction("billing.change")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Provider billing sync envelope" })
  syncProviderBillingState(@Body() payload: ProviderSyncBody, @Req() request: ServiceAdminRequest) {
    return this.billingService.syncProviderBillingState({ ...payload, actor: request.serviceAdminContext?.actor });
  }

  @Post("quota-checks")
  @RequireServiceAdminAction("quotas.check")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Quota enforcement check envelope" })
  checkQuota(@Body() payload: QuotaCheckBody) {
    return this.billingService.checkQuota(payload);
  }

  @Post("reservations")
  @RequireServiceAdminAction("quotas.check")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Quota reservation envelope" })
  reserveQuota(@Body() payload: QuotaReservationBody) {
    return this.billingService.reserveQuota(payload);
  }

  @Post("reservations/:reservationId/commit")
  @RequireServiceAdminAction("quotas.check")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Quota reservation commit envelope" })
  commitQuotaReservation(@Param("reservationId") reservationId: string, @Body() payload: QuotaReservationTransitionBody) {
    return this.billingService.commitQuotaReservation({ ...payload, reservationId });
  }

  @Post("reservations/:reservationId/release")
  @RequireServiceAdminAction("quotas.check")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Quota reservation release envelope" })
  releaseQuotaReservation(@Param("reservationId") reservationId: string, @Body() payload: QuotaReservationTransitionBody) {
    return this.billingService.releaseQuotaReservation({ ...payload, reservationId });
  }
}

@ApiTags("public")
@Controller("public/catalog")
export class PublicBillingCatalogController {
  constructor(private readonly billingService: BillingService) {}

  @Get("tariffs")
  @ApiOkResponse({ description: "Public canonical tariff catalog envelope" })
  fetchTariffs() {
    return this.billingService.fetchTariffs();
  }
}

interface YooKassaWebhookBody {
  object?: { id?: string };
}

@ApiTags("public")
@Controller("public/billing/yookassa")
export class YooKassaWebhookController {
  constructor(private readonly billingService: BillingService) {}

  @Post("webhook")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Verifies a YooKassa payment server-to-server before syncing billing state" })
  receiveWebhook(@Body() payload: YooKassaWebhookBody) {
    return this.billingService.handleYooKassaWebhook(payload?.object?.id ?? "");
  }
}

@ApiTags("tenant-billing")
@UseGuards(TenantOperatorAuthGuard)
@Controller("tenant/billing")
export class TenantBillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get("overview")
  @RequireTenantOperatorPermission("settings.manage")
  @ApiOkResponse({ description: "Current tenant tariff, quota usage and invoice overview" })
  fetchOverview(@Req() request: TenantOperatorRequest) {
    return this.billingService.fetchTenantBillingOverview(request.tenantOperatorContext?.tenantId ?? "");
  }

  @Post("ai-dialog-packages/purchases")
  @RequireTenantOperatorPermission("settings.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Purchases an AI dialog package from the current tenant balance" })
  purchaseAiDialogPackage(@Body() payload: AiDialogPackageBody, @Req() request: TenantOperatorRequest) {
    return this.billingService.purchaseAiDialogPackage({
      idempotencyKey: payload.idempotencyKey,
      packageId: payload.packageId,
      reason: "Tenant self-service AI dialog package purchase",
      tenantId: request.tenantOperatorContext?.tenantId ?? ""
    });
  }

}

@ApiTags("quotas")
@UseGuards(ServiceAdminSessionGuard)
@Controller("quotas")
export class QuotaController {
  constructor(private readonly billingService: BillingService) {}

  @Get("tenants/:tenantId")
  @RequireServiceAdminAction("quotas.read")
  @ApiOkResponse({ description: "Tenant quota snapshot envelope" })
  fetchTenantQuotaSnapshot(@Param("tenantId") tenantId: string) {
    return this.billingService.fetchTenantQuotaSnapshot(tenantId);
  }

  @Post("check")
  @RequireServiceAdminAction("quotas.check")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Quota enforcement check envelope" })
  checkQuota(@Body() payload: QuotaCheckBody) {
    return this.billingService.checkQuota(payload);
  }
}
