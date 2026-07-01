import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { DemoServiceAdminGuard } from "../identity/demo-service-admin.guard.js";
import { RequireServiceAdminAction, type ServiceAdminRequest } from "../identity/service-admin-auth.js";
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
@UseGuards(DemoServiceAdminGuard)
@Controller("billing")
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get("tariffs")
  @RequireServiceAdminAction("billing.read")
  @ApiOkResponse({ description: "Billing tariff catalog envelope" })
  fetchTariffs() {
    return this.billingService.fetchTariffs();
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

@ApiTags("quotas")
@UseGuards(DemoServiceAdminGuard)
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
