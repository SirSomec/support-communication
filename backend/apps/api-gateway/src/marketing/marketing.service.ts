import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createEnvelope, type BackendEnvelope } from "@support-communication/envelope";
import { createPrismaClient } from "@support-communication/database";
import { createOutboxEvent } from "@support-communication/events";
import { createRequestTraceId } from "@support-communication/observability";
import { BillingService } from "../billing/billing.service.js";

const SERVICE = "marketingService";
const MARKETING_PLANS = Object.freeze({
  start: { includedMessages: 10_000, overageKopeks: 50 },
  business: { includedMessages: 50_000, overageKopeks: 30 },
  scale: { includedMessages: 100_000, overageKopeks: 20 }
});
const DEFAULT_CONTENT = Object.freeze({ blocks: [] });
export const DEFAULT_MARKETING_CONSENT_TEXT = "Чтобы получать новости и предложения в этом канале, ответьте на это сообщение любым текстом. Отправляя ответ, вы соглашаетесь на получение маркетинговых сообщений.";
const LEGACY_MARKETING_CONSENT_TEXTS = new Set([
  "Согласны на рекламу?",
  "Разрешаете получать маркетинговые сообщения? Ответьте «Да», чтобы подтвердить согласие."
]);
export function isLegacyMarketingConsentText(value: unknown): boolean {
  return LEGACY_MARKETING_CONSENT_TEXTS.has(text(value, 5_000));
}
export function marketingConsentPolicy(settings: { allowWithoutConsent?: boolean; requestConsentEnabled?: boolean } | null | undefined) {
  return {
    allowWithoutConsent: settings?.allowWithoutConsent === true,
    requestConsentEnabled: settings?.requestConsentEnabled !== false
  };
}
export function marketingConsentAllowsDelivery(status: unknown, allowWithoutConsent: boolean): boolean {
  const normalizedStatus = String(status ?? "").toLowerCase();
  return normalizedStatus === "granted" || (allowWithoutConsent && normalizedStatus !== "withdrawn");
}
const prisma = createPrismaClient() as any;

export interface MarketingContext {
  tenantId: string;
  userId: string;
}

export class MarketingService {
  async recordInboundConsentReply(input: { channel: string; phone: string; tenantId: string; text: string }): Promise<{ recorded: boolean; status?: "granted" }> {
    const reply = normalizeConsentReply(input.text);
    if (!reply || !input.phone.trim()) return { recorded: false };
    const channel = text(input.channel, 64).toLowerCase();
    const profile = await this.findInboundMarketingProfile(input.tenantId, channel, input.phone);
    if (!profile) return { recorded: false };
    const pending = await prisma.marketingConsent.findUnique({ where: { tenantId_clientId_channel: { tenantId: input.tenantId, clientId: profile.id, channel } } });
    if (!pending || pending.status !== "pending") return { recorded: false };
    const now = new Date();
    const [settings, tenant, blockedDeliveries] = await Promise.all([
      this.ensureSettings(input.tenantId),
      prisma.tenant.findUnique({ where: { id: input.tenantId }, select: { metadata: true } }),
      prisma.marketingDelivery.findMany({
        where: { tenantId: input.tenantId, clientId: profile.id, channel, status: "excluded", excludedReason: "consent_required" },
        select: { campaignId: true, channel: true, clientId: true, id: true }
      })
    ]);
    const campaignIds = [...new Set(blockedDeliveries.map((delivery: { campaignId: string }) => delivery.campaignId))];
    const resumableCampaigns = campaignIds.length
      ? await prisma.marketingCampaign.findMany({ where: { tenantId: input.tenantId, id: { in: campaignIds }, status: { in: ["sending", "completed"] } }, select: { id: true } })
      : [];
    const resumableIds = new Set(resumableCampaigns.map((campaign: { id: string }) => campaign.id));
    const resumableDeliveries = blockedDeliveries.filter((delivery: { campaignId: string }) => resumableIds.has(delivery.campaignId));
    const fallbackTimeZone = tenantTimeZone(tenant?.metadata);
    const scheduledAt = quietHoursEnd(now, settings.quietHoursStart, settings.quietHoursEnd, tenantTimeZone({ timeZone: profile?.timeZone || fallbackTimeZone }));
    const recorded = await prisma.$transaction(async (tx: any) => {
      const updated = await tx.marketingConsent.updateMany({ where: { id: pending.id, status: "pending" }, data: {
        status: "granted",
        source: "client_reply",
        evidence: { ...(isRecord(pending.evidence) ? pending.evidence : {}), inboundReply: input.text.trim().slice(0, 500), recordedBy: "client", recordedAt: now.toISOString(), rule: "any_reply_after_request" },
        recordedAt: now
      } });
      if (!updated.count) return false;
      if (resumableDeliveries.length) {
        await tx.marketingDelivery.updateMany({ where: { id: { in: resumableDeliveries.map((delivery: { id: string }) => delivery.id) }, status: "excluded", excludedReason: "consent_required" }, data: { status: "queued", excludedReason: null, scheduledAt } });
        await tx.marketingCampaign.updateMany({ where: { tenantId: input.tenantId, id: { in: [...resumableIds] } }, data: { status: "sending" } });
        await this.createUsageCharges(tx, input.tenantId, resumableDeliveries, settings, now);
      }
      await tx.marketingAuditEvent.create({ data: { id: `mkt_audit_${randomUUID()}`, tenantId: input.tenantId, actorUserId: null, action: "marketing.consent.granted_by_reply", entityType: "consent", entityId: pending.id, details: { channel, clientId: profile.id, resumedDeliveries: resumableDeliveries.length, rule: "any_reply_after_request" } } });
      return true;
    });
    if (!recorded) return { recorded: false };
    await this.dispatchQueuedMarketingDeliveries(input.tenantId);
    return { recorded: true, status: "granted" };
  }

  async requestInboundMarketingConsent(input: {
    channel: string;
    clientSince?: string;
    conversationId: string;
    device?: string;
    entry?: string;
    name: string;
    phone: string;
    providerConversationId?: string;
    tenantId: string;
    topic?: string;
  }): Promise<{ reason?: string; requested: boolean }> {
    const channel = text(input.channel, 64).toLowerCase();
    const phone = text(input.phone, 256);
    const destination = inboundMarketingDeliveryAddress(phone, input.providerConversationId);
    if (!channel || !phone || !destination) return { requested: false, reason: "destination_missing" };
    const settings = await this.ensureSettings(input.tenantId);
    if (settings.moduleStatus !== "active") return { requested: false, reason: "marketing_module_inactive" };
    if (!marketingConsentPolicy(settings).requestConsentEnabled) return { requested: false, reason: "consent_requests_disabled" };
    const sourceProfileId = inboundMarketingProfileIdentity(input.tenantId, channel, phone);
    let profile = await this.findInboundMarketingProfile(input.tenantId, channel, phone);
    if (!profile) {
      profile = await prisma.clientProfile.upsert({
        where: { tenantId_sourceProfileId: { tenantId: input.tenantId, sourceProfileId } },
        create: {
          id: `client_${createHash("sha256").update(`${input.tenantId}:${sourceProfileId}`).digest("hex").slice(0, 32)}`,
          tenantId: input.tenantId,
          sourceProfileId,
          name: text(input.name, 256) || "Клиент",
          channel,
          phone,
          phoneNormalized: normalizePhone(phone) || null,
          device: text(input.device, 128) || channel,
          entry: text(input.entry, 128) || channel,
          topic: text(input.topic, 256) || `${channel} / inbound`,
          clientSince: text(input.clientSince, 128) || new Date().toISOString().slice(0, 10),
          previous: []
        },
        update: {
          name: text(input.name, 256) || "Клиент",
          channel,
          phone,
          phoneNormalized: normalizePhone(phone) || null,
          device: text(input.device, 128) || channel,
          entry: text(input.entry, 128) || channel,
          topic: text(input.topic, 256) || `${channel} / inbound`,
          clientSince: text(input.clientSince, 128) || new Date().toISOString().slice(0, 10)
        },
        select: { channel: true, id: true, timeZone: true }
      });
    }
    if (!profile) return { requested: false, reason: "profile_resolution_failed" };
    const consentProfile = profile;
    const existing = await prisma.marketingConsent.findUnique({ where: { tenantId_clientId_channel: { tenantId: input.tenantId, clientId: consentProfile.id, channel } }, select: { status: true } });
    if (existing) return { requested: false, reason: existing.status === "pending" ? "awaiting_reply" : `consent_${existing.status}` };
    const consentId = `mkt_consent_${randomUUID()}`;
    const descriptorId = `mkt_consent_outbound_${randomUUID()}`;
    const now = new Date();
    const outbox = createOutboxEvent({
      aggregateId: consentId,
      aggregateType: "marketing_consent",
      payload: { channel, descriptorId, maxAttempts: 3 },
      queue: "message-delivery",
      traceId: createRequestTraceId(SERVICE, "requestInboundMarketingConsent"),
      type: "conversation.outbound.requested"
    });
    const requested = await prisma.$transaction(async (tx: any) => {
      const concurrent = await tx.marketingConsent.findUnique({ where: { tenantId_clientId_channel: { tenantId: input.tenantId, clientId: consentProfile.id, channel } }, select: { id: true } });
      if (concurrent) return false;
      await tx.marketingConsent.create({ data: {
        id: consentId,
        tenantId: input.tenantId,
        clientId: consentProfile.id,
        channel,
        status: "pending",
        source: "system",
        consentVersion: settings.consentVersion,
        evidence: { conversationId: input.conversationId, descriptorId, requestedAt: now.toISOString(), trigger: "first_inbound_message" },
        recordedAt: now
      } });
      await tx.conversationOutboundDescriptor.create({ data: {
        id: descriptorId,
        kind: "outbound_conversation",
        tenantId: input.tenantId,
        conversationId: null,
        messageId: null,
        channel,
        status: "queued",
        deliveryState: "queued",
        idempotencyKey: `marketing-consent:${consentId}`,
        requestFingerprint: `marketing-consent:${consentProfile.id}:${channel}`,
        retryable: true,
        payload: { channel, clientName: text(input.name, 256), marketingConsentId: consentId, message: settings.consentText || DEFAULT_MARKETING_CONSENT_TEXT, phone: destination, queue: "message-delivery", topic: "marketing-consent" },
        auditId: null,
        traceId: outbox.traceId,
        outboxEventId: outbox.id
      } });
      await tx.outboxEvent.create({ data: { id: outbox.id, aggregateId: outbox.aggregateId, aggregateType: outbox.aggregateType, occurredAt: new Date(outbox.occurredAt), payload: outbox.payload, queue: outbox.queue, status: outbox.status, traceId: outbox.traceId, type: outbox.type } });
      await tx.marketingAuditEvent.create({ data: { id: `mkt_audit_${randomUUID()}`, tenantId: input.tenantId, actorUserId: null, action: "marketing.consent.requested_on_first_inbound", entityType: "consent", entityId: consentId, details: { channel, clientId: consentProfile.id, conversationId: input.conversationId, descriptorId } } });
      return true;
    });
    return { requested, ...(requested ? {} : { reason: "request_already_created" }) };
  }

  async billPendingOverage(limit = 10): Promise<{ billed: number; failed: number; skipped: number }> {
    let billed = 0;
    let failed = 0;
    let skipped = 0;
    for (let index = 0; index < Math.max(1, Math.min(limit, 100)); index += 1) {
      let invoice = await prisma.marketingUsageInvoice.findFirst({ where: { status: "pending" }, orderBy: { createdAt: "asc" } });
      if (!invoice) {
        const charges = await prisma.marketingUsageCharge.findMany({ where: { billingStatus: "pending", amountKopeks: { gt: 0 } }, orderBy: { createdAt: "asc" }, take: 10_000 });
        if (!charges.length) { skipped += 1; break; }
        const seed = charges[0];
        const batch = charges.filter((charge: any) => charge.tenantId === seed.tenantId && charge.periodStart.getTime() === seed.periodStart.getTime());
        const invoiceId = `mkt_invoice_${randomUUID()}`;
        invoice = await prisma.$transaction(async (tx: any) => {
          const created = await tx.marketingUsageInvoice.create({ data: { id: invoiceId, tenantId: seed.tenantId, periodStart: seed.periodStart, amountKopeks: batch.reduce((sum: number, charge: any) => sum + charge.amountKopeks, 0), chargeCount: batch.length, idempotencyKey: `marketing-overage:${invoiceId}` } });
          await tx.marketingUsageCharge.updateMany({ where: { id: { in: batch.map((charge: any) => charge.id) }, billingStatus: "pending" }, data: { billingStatus: "invoicing", invoiceId } });
          return created;
        });
      }
      const claimed = await prisma.marketingUsageInvoice.updateMany({ where: { id: invoice.id, status: "pending" }, data: { status: "invoicing", lastError: null } });
      if (!claimed.count) { skipped += 1; continue; }
      const response = await new BillingService().chargeMarketingOverage({ amountKopeks: invoice.amountKopeks, idempotencyKey: invoice.idempotencyKey, periodStart: invoice.periodStart.toISOString(), tenantId: invoice.tenantId });
      if (response.status === "ok") {
        const paymentId = String(response.data?.paymentId ?? "");
        await prisma.$transaction([
          prisma.marketingUsageInvoice.update({ where: { id: invoice.id }, data: { status: "invoiced", providerInvoiceId: paymentId || null } }),
          prisma.marketingUsageCharge.updateMany({ where: { invoiceId: invoice.id }, data: { billingStatus: "invoiced" } })
        ]);
        billed += 1;
      } else {
        await prisma.marketingUsageInvoice.update({ where: { id: invoice.id }, data: { status: "pending", lastError: String(response.error?.message ?? response.error?.code ?? "billing_failed").slice(0, 500) } });
        failed += 1;
        break;
      }
    }
    return { billed, failed, skipped };
  }

  async purgeExpiredData(retentionDays = 90): Promise<Record<string, number>> {
    const safeDays = Math.max(1, Math.min(Math.floor(retentionDays), 3650));
    const cutoff = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);
    const [deliveries, charges, invoices, campaigns, consents, consentTextVersions, auditEvents] = await prisma.$transaction([
      prisma.marketingDelivery.deleteMany({ where: { createdAt: { lt: cutoff } } }),
      prisma.marketingUsageCharge.deleteMany({ where: { createdAt: { lt: cutoff } } }),
      prisma.marketingUsageInvoice.deleteMany({ where: { createdAt: { lt: cutoff } } }),
      prisma.marketingCampaign.deleteMany({ where: { createdAt: { lt: cutoff } } }),
      prisma.marketingConsent.deleteMany({ where: { createdAt: { lt: cutoff } } }),
      prisma.marketingConsentTextVersion.deleteMany({ where: { createdAt: { lt: cutoff } } }),
      prisma.marketingAuditEvent.deleteMany({ where: { createdAt: { lt: cutoff } } })
    ]);
    return { auditEvents: auditEvents.count, campaigns: campaigns.count, charges: charges.count, consents: consents.count, consentTextVersions: consentTextVersions.count, deliveries: deliveries.count, invoices: invoices.count };
  }

  async dispatchDueCampaigns(limit = 50): Promise<{ launched: number; skipped: number }> {
    const now = new Date();
    const due = await prisma.marketingCampaign.findMany({
      where: { status: "scheduled", scheduledAt: { lte: now } },
      orderBy: { scheduledAt: "asc" },
      take: Math.max(1, Math.min(limit, 100))
    });
    let launched = 0;
    let skipped = 0;
    for (const campaign of due) {
      try {
        const result = await this.launchCampaign(campaign.id, `scheduled:${campaign.id}`, { tenantId: campaign.tenantId, userId: campaign.createdBy });
        if (result.status === "ok") launched += 1;
        else skipped += 1;
      } catch {
        skipped += 1;
      }
    }
    const activeCampaigns = await prisma.marketingCampaign.findMany({ where: { status: "sending" }, distinct: ["tenantId"], select: { tenantId: true } });
    await Promise.all(activeCampaigns.map(async (campaign: { tenantId: string }) => {
      await this.dispatchQueuedMarketingDeliveries(campaign.tenantId);
      await this.requestMissingMarketingConsents(campaign.tenantId);
      await this.reconcileOutboundDeliveryStates(campaign.tenantId);
    }));
    return { launched, skipped };
  }

  async accessStatus(context: MarketingContext): Promise<BackendEnvelope<Record<string, unknown>>> {
    const access = await this.resolveAccess(context);
    const settings = await this.ensureSettings(context.tenantId);
    return envelope("accessStatus", {
      allowed: access.allowed,
      isOwner: access.isOwner,
      reason: access.reason,
      moduleStatus: settings.moduleStatus,
      planKey: settings.planKey
    });
  }

  async fetchWorkspace(context: MarketingContext): Promise<BackendEnvelope<Record<string, unknown>>> {
    const access = await this.resolveAccess(context);
    if (!access.allowed) return deniedEnvelope("fetchWorkspace", access.reason);

    const periodStart = marketingPeriodStart(new Date());
    const [settings, campaigns, audiences, audienceMemberCounts, audienceSyncs, templates, users, grants, usage, channels, apiKeys] = await Promise.all([
      this.ensureSettings(context.tenantId),
      prisma.marketingCampaign.findMany({ where: { tenantId: context.tenantId }, orderBy: { updatedAt: "desc" }, take: 100 }),
      prisma.marketingAudience.findMany({ where: { tenantId: context.tenantId, status: "active" }, orderBy: { updatedAt: "desc" }, take: 100 }),
      prisma.marketingAudienceMember.groupBy({ by: ["audienceId"], where: { tenantId: context.tenantId }, _count: { _all: true } }),
      prisma.marketingAudienceSync.findMany({ where: { tenantId: context.tenantId }, select: { audienceId: true, lastAttemptAt: true, lastError: true, lastSuccessAt: true, status: true } }),
      prisma.marketingTemplate.findMany({ where: { tenantId: context.tenantId }, orderBy: { updatedAt: "desc" }, take: 100 }),
      access.isOwner ? prisma.tenantUser.findMany({ where: { tenantId: context.tenantId, status: "active" }, select: { id: true, name: true, email: true, role: true } }) : [],
      access.isOwner ? prisma.marketingAccess.findMany({ where: { tenantId: context.tenantId }, select: { userId: true, enabled: true, grantedAt: true } }) : [],
      prisma.marketingUsageCharge.aggregate({ where: { tenantId: context.tenantId, periodStart }, _count: { _all: true }, _sum: { amountKopeks: true } }),
      prisma.channelConnection.findMany({ where: { tenantId: context.tenantId, status: "active" }, select: { id: true, name: true, type: true } }),
      access.isOwner ? prisma.marketingApiKey.findMany({ where: { tenantId: context.tenantId }, select: { id: true, keyLastFour: true, createdAt: true, createdBy: true, lastUsedAt: true, revokedAt: true }, orderBy: { createdAt: "desc" }, take: 100 }) : []
    ]);
    await this.reconcileOutboundDeliveryStates(context.tenantId);
    const campaignIds = campaigns.map((item: { id: string }) => item.id);
    const deliveries = campaignIds.length
      ? await prisma.marketingDelivery.groupBy({ by: ["campaignId", "status"], where: { tenantId: context.tenantId, campaignId: { in: campaignIds } }, _count: { _all: true } })
      : [];

    return envelope("fetchWorkspace", {
      access: { enabled: true, isOwner: access.isOwner },
      campaigns: campaigns.map((campaign: any) => ({ ...serialize(campaign), deliverySummary: summarizeDeliveries(deliveries, campaign.id) })),
      audiences: audiences.map((audience: any) => ({ ...serialize(audience), _count: { members: audienceMemberCounts.find((count: { audienceId: string }) => count.audienceId === audience.id)?._count._all ?? 0 }, sync: serialize(audienceSyncs.find((sync: { audienceId: string }) => sync.audienceId === audience.id) ?? null) })),
      templates: templates.map(serialize),
      channels: channels.map(serialize),
      channelCapabilities: channels.map((channel: { id: string; status: string; type: string }) => marketingChannelCapability(channel)),
      settings: serialize(settings),
      usage: { periodStart: periodStart.toISOString(), messages: usage._count._all, overageKopeks: usage._sum.amountKopeks ?? 0, includedMessages: settings.includedMessages },
      apiKeys: apiKeys.map(serialize),
      users: users.map((user: any) => ({ ...serialize(user), marketingEnabled: access.isOwner && (String(user.role).toLowerCase() === "owner" || grants.some((grant: any) => grant.userId === user.id && grant.enabled)) })),
      tariffs: MARKETING_PLANS
    });
  }

  async getCampaignResults(campaignId: string, page: unknown, pageSize: unknown, context: MarketingContext) {
    await this.requireModuleAccess(context);
    await this.reconcileOutboundDeliveryStates(context.tenantId);
    const campaign = await this.findCampaign(campaignId, context.tenantId);
    if (!campaign) return notFoundEnvelope("getCampaignResults", "marketing_campaign_not_found", "Campaign was not found.");
    const normalizedPage = boundedPositiveInt(page, 1, 100_000);
    const normalizedPageSize = boundedPositiveInt(pageSize, 100, 1_000);
    const [summary, recipientCount, recipients] = await Promise.all([
      prisma.marketingDelivery.groupBy({ by: ["status"], where: { tenantId: context.tenantId, campaignId }, _count: { _all: true } }),
      prisma.marketingDelivery.count({ where: { tenantId: context.tenantId, campaignId } }),
      prisma.marketingDelivery.findMany({ where: { tenantId: context.tenantId, campaignId }, orderBy: { createdAt: "desc" }, skip: (normalizedPage - 1) * normalizedPageSize, take: normalizedPageSize })
    ]);
    await this.recordAudit(context, "marketing.campaign.results_viewed", "campaign", campaign.id, { page: normalizedPage, pageSize: normalizedPageSize, recipientCount: recipients.length });
    return envelope("getCampaignResults", {
      campaign: serialize(campaign),
      summary: summarizeDeliveries(summary, campaignId),
      recipients: recipients.map(serialize),
      analytics: { read: { count: null, state: "not_supported" } },
      pagination: { page: normalizedPage, pageSize: normalizedPageSize, total: recipientCount, totalPages: Math.ceil(recipientCount / normalizedPageSize), hasNextPage: normalizedPage * normalizedPageSize < recipientCount }
    });
  }

  async searchTestRecipients(value: unknown, context: MarketingContext) {
    await this.requireModuleAccess(context);
    const { phone, query } = marketingTestRecipientSearchTerms(value);
    if (query.length < 2) return envelope("searchTestRecipients", { items: [], query, minimumQueryLength: 2 });
    const profiles = await prisma.clientProfile.findMany({
      where: {
        tenantId: context.tenantId,
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { email: { contains: query, mode: "insensitive" } },
          { phone: { contains: query } },
          ...(phone.length >= 3 ? [{ phoneNormalized: { contains: phone } }] : [])
        ]
      },
      orderBy: [{ name: "asc" }, { updatedAt: "desc" }],
      take: 20,
      select: { channel: true, email: true, id: true, name: true, phone: true, sourceProfileId: true }
    });
    return envelope("searchTestRecipients", {
      items: profiles.map((profile: { channel: string; email: string | null; id: string; name: string; phone: string; sourceProfileId: string }) => ({
        channel: profile.channel,
        email: maskMarketingTestRecipientEmail(profile.email),
        id: profile.id,
        name: profile.name,
        phone: maskMarketingTestRecipientPhone(profile.phone),
        sourceProfileId: profile.sourceProfileId
      })),
      query,
      minimumQueryLength: 2
    });
  }

  async getCampaignAnalytics(context: MarketingContext) {
    await this.requireModuleAccess(context);
    await this.reconcileOutboundDeliveryStates(context.tenantId);
    const campaigns = await prisma.marketingCampaign.findMany({ where: { tenantId: context.tenantId }, orderBy: { updatedAt: "desc" }, take: 1_000, select: { id: true, status: true, title: true, updatedAt: true } });
    const campaignIds = campaigns.map((campaign: { id: string }) => campaign.id);
    const deliveries = campaignIds.length ? await prisma.marketingDelivery.groupBy({ by: ["campaignId", "status"], where: { tenantId: context.tenantId, campaignId: { in: campaignIds } }, _count: { _all: true } }) : [];
    return envelope("getCampaignAnalytics", {
      campaigns: campaigns.map((campaign: { id: string; status: string; title: string; updatedAt: Date }) => ({ ...serialize(campaign), deliverySummary: summarizeDeliveries(deliveries, campaign.id), read: { count: null, state: "not_supported" } }))
    });
  }

  async preflightCampaign(campaignId: string, context: MarketingContext) {
    await this.requireModuleAccess(context);
    const campaign = await this.findCampaign(campaignId, context.tenantId);
    if (!campaign) return notFoundEnvelope("preflightCampaign", "marketing_campaign_not_found", "Campaign was not found.");
    if (!campaign.audienceId) return invalidEnvelope("preflightCampaign", "marketing_campaign_audience_required", "A static audience is required for preflight.");
    const members = await prisma.marketingAudienceMember.findMany({ where: { tenantId: context.tenantId, audienceId: campaign.audienceId }, select: { clientId: true } });
    const clientIds = members.map((member: { clientId: string }) => member.clientId);
    const [profiles, consents, settings, usage] = await Promise.all([
      prisma.clientProfile.findMany({ where: { tenantId: context.tenantId, id: { in: clientIds } }, select: { id: true, phone: true } }),
      prisma.marketingConsent.findMany({ where: { tenantId: context.tenantId, clientId: { in: clientIds }, channel: { in: campaign.channels } }, select: { clientId: true, channel: true, status: true } }),
      this.ensureSettings(context.tenantId),
      prisma.marketingUsageCharge.count({ where: { tenantId: context.tenantId, periodStart: marketingPeriodStart(new Date()) } })
    ]);
    const profileSet = new Set(profiles.filter((profile: { phone: string }) => Boolean(profile.phone)).map((profile: { id: string }) => profile.id));
    const consentStatusByKey = new Map(consents.map((consent: { clientId: string; channel: string; status: string }) => [`${consent.clientId}:${consent.channel}`, consent.status] as const));
    const { allowWithoutConsent } = marketingConsentPolicy(settings);
    let consentRequired = 0;
    let destinationMissing = 0;
    let eligible = 0;
    for (const clientId of clientIds) for (const channel of campaign.channels) {
      if (!profileSet.has(clientId)) { destinationMissing += 1; continue; }
      if (!marketingConsentAllowsDelivery(consentStatusByKey.get(`${clientId}:${channel}`), allowWithoutConsent)) { consentRequired += 1; continue; }
      eligible += 1;
    }
    await this.recordAudit(context, "marketing.campaign.preflight", "campaign", campaign.id, { audience: members.length, eligible });
    return envelope("preflightCampaign", { campaignId: campaign.id, audience: members.length, channelCount: campaign.channels.length, eligible, exclusions: { consentRequired, destinationMissing }, projectedOverageRecipients: Math.max(0, usage + eligible - settings.includedMessages) });
  }

  async exportCampaignResults(campaignId: string, kind: unknown, format: unknown, context: MarketingContext) {
    await this.requireModuleAccess(context);
    await this.reconcileOutboundDeliveryStates(context.tenantId);
    const campaign = await this.findCampaign(campaignId, context.tenantId);
    if (!campaign) return notFoundEnvelope("exportCampaignResults", "marketing_campaign_not_found", "Campaign was not found.");
    const exportKind = kind === "summary" ? "summary" : "detailed";
    const exportFormat = format === "xlsx" ? "xlsx" : "csv";
    const deliveries = await prisma.marketingDelivery.findMany({ where: { tenantId: context.tenantId, campaignId: campaign.id }, orderBy: { createdAt: "asc" }, take: 100_000, select: { clientId: true, channel: true, status: true, excludedReason: true, createdAt: true, updatedAt: true } });
    const profiles = exportKind === "detailed" && deliveries.length ? await prisma.clientProfile.findMany({ where: { tenantId: context.tenantId, id: { in: deliveries.map((delivery: { clientId: string }) => delivery.clientId) } }, select: { id: true, name: true, phone: true } }) : [];
    const profilesById = new Map<string, { id: string; name: string; phone: string }>(profiles.map((profile: { id: string; name: string; phone: string }) => [profile.id, profile] as const));
    const rows = exportKind === "summary"
      ? Object.entries(summarizeDeliveries(deliveries, campaign.id)).map(([status, count]) => ({ status, count }))
      : deliveries.map((delivery: { clientId: string; channel: string; status: string; excludedReason: string | null; createdAt: Date; updatedAt: Date }) => ({ clientId: delivery.clientId, clientName: profilesById.get(delivery.clientId)?.name ?? "", phone: profilesById.get(delivery.clientId)?.phone ?? "", channel: delivery.channel, status: delivery.status, excludedReason: delivery.excludedReason ?? "", queuedAt: delivery.createdAt.toISOString(), updatedAt: delivery.updatedAt.toISOString() }));
    await this.recordAudit(context, "marketing.campaign.results_exported", "campaign", campaign.id, { format: exportFormat, kind: exportKind, rowCount: rows.length, fields: exportKind === "summary" ? ["status", "count"] : ["clientId", "clientName", "phone", "channel", "status", "excludedReason", "queuedAt", "updatedAt"] });
    return envelope("exportCampaignResults", { campaign: { id: campaign.id, title: campaign.title }, format: exportFormat, kind: exportKind, rows });
  }

  async getClientPreferences(clientId: string, context: MarketingContext) {
    await this.requireModuleAccess(context);
    const client = await prisma.clientProfile.findFirst({ where: { tenantId: context.tenantId, OR: [{ id: clientId }, { sourceProfileId: clientId }] }, select: { id: true } });
    if (!client) return notFoundEnvelope("getClientPreferences", "marketing_client_not_found", "Client was not found.");
    const consents = await prisma.marketingConsent.findMany({ where: { tenantId: context.tenantId, clientId: client.id }, orderBy: { recordedAt: "desc" } });
    return envelope("getClientPreferences", { clientId: client.id, consents: consents.map(serialize) });
  }

  async updateAccess(userId: string, enabled: boolean, context: MarketingContext) {
    await this.requireOwner(context);
    const targetUser = await prisma.tenantUser.findFirst({ where: { tenantId: context.tenantId, id: userId, status: "active" }, select: { role: true } });
    if (!targetUser) return notFoundEnvelope("updateAccess", "marketing_tenant_user_not_found", "An active tenant user is required before marketing access can be granted.");
    if (String(targetUser.role).toLowerCase() === "owner") return invalidEnvelope("updateAccess", "marketing_owner_access_implicit", "The tenant owner always has marketing access and does not need a separate grant.");
    const now = new Date();
    const access = await prisma.marketingAccess.upsert({
      where: { tenantId_userId: { tenantId: context.tenantId, userId } },
      create: { id: `mkt_access_${randomUUID()}`, tenantId: context.tenantId, userId, enabled, grantedBy: context.userId, grantedAt: now },
      update: { enabled, grantedBy: context.userId, grantedAt: now }
    });
    await this.recordAudit(context, enabled ? "marketing.access.granted" : "marketing.access.revoked", "access", access.id, { targetUserId: userId });
    return envelope("updateAccess", { access: serialize(access) });
  }

  async activateModule(planKey: string, context: MarketingContext) {
    await this.requireOwner(context);
    const plan = MARKETING_PLANS[planKey as keyof typeof MARKETING_PLANS];
    if (!plan) return invalidEnvelope("activateModule", "marketing_plan_invalid", "Unsupported marketing plan.");
    const settings = await prisma.marketingSettings.upsert({
      where: { tenantId: context.tenantId },
      create: { tenantId: context.tenantId, moduleStatus: "active", planKey, ...plan },
      update: { moduleStatus: "active", planKey, ...plan }
    });
    await this.recordAudit(context, "marketing.module.activated", "settings", context.tenantId, { planKey });
    return envelope("activateModule", { settings: serialize(settings) });
  }

  async createApiKey(context: MarketingContext) {
    await this.requireOwner(context);
    const settings = await this.ensureSettings(context.tenantId);
    if (settings.moduleStatus !== "active") return invalidEnvelope("createApiKey", "marketing_module_inactive", "Activate the marketing module before creating an API key.");
    const secret = `mk_live_${randomUUID().replaceAll("-", "")}${randomUUID().replaceAll("-", "")}`;
    const apiKey = await prisma.marketingApiKey.create({ data: {
      id: `mkt_key_${randomUUID()}`,
      tenantId: context.tenantId,
      keyHash: hashMarketingApiKey(secret),
      keyLastFour: secret.slice(-4),
      createdBy: context.userId
    } });
    await this.recordAudit(context, "marketing.api_key.created", "api_key", apiKey.id);
    return envelope("createApiKey", { apiKey: { ...serialize(apiKey), secret } });
  }

  async revokeApiKey(apiKeyId: string, context: MarketingContext) {
    await this.requireOwner(context);
    const apiKey = await prisma.marketingApiKey.findFirst({ where: { id: apiKeyId, tenantId: context.tenantId } });
    if (!apiKey) return notFoundEnvelope("revokeApiKey", "marketing_api_key_not_found", "Marketing API key was not found.");
    if (apiKey.revokedAt) return envelope("revokeApiKey", { apiKey: serialize(apiKey), alreadyRevoked: true });
    const revoked = await prisma.marketingApiKey.update({ where: { id: apiKey.id }, data: { revokedAt: new Date() } });
    await this.recordAudit(context, "marketing.api_key.revoked", "api_key", apiKey.id);
    return envelope("revokeApiKey", { apiKey: serialize(revoked) });
  }

  async updateSettings(payload: Record<string, unknown>, context: MarketingContext) {
    await this.requireOwner(context);
    const quietHoursStart = hour(payload.quietHoursStart);
    const quietHoursEnd = hour(payload.quietHoursEnd);
    const consentText = payload.consentText === undefined ? undefined : text(payload.consentText, 5_000);
    const requestConsentEnabled = typeof payload.requestConsentEnabled === "boolean" ? payload.requestConsentEnabled : undefined;
    const allowWithoutConsent = typeof payload.allowWithoutConsent === "boolean" ? payload.allowWithoutConsent : undefined;
    const current = await this.ensureSettings(context.tenantId);
    const consentChanged = consentText !== undefined && consentText !== current.consentText;
    const settings = await prisma.$transaction(async (tx: any) => {
      const nextVersion = current.consentVersion + 1;
      const updated = await tx.marketingSettings.update({ where: { tenantId: context.tenantId }, data: {
        ...(quietHoursStart === null ? {} : { quietHoursStart }),
        ...(quietHoursEnd === null ? {} : { quietHoursEnd }),
        ...(requestConsentEnabled === undefined ? {} : { requestConsentEnabled }),
        ...(allowWithoutConsent === undefined ? {} : { allowWithoutConsent }),
        ...(consentText === undefined ? {} : { consentText, ...(consentChanged ? { consentVersion: nextVersion } : {}) })
      } });
      if (consentChanged) await tx.marketingConsentTextVersion.create({ data: { id: `mkt_consent_text_${randomUUID()}`, tenantId: context.tenantId, version: nextVersion, content: consentText ?? "", createdBy: context.userId } });
      return updated;
    });
    await this.recordAudit(context, "marketing.settings.updated", "settings", context.tenantId, { allowWithoutConsent: settings.allowWithoutConsent, consentChanged, quietHoursEnd: settings.quietHoursEnd, quietHoursStart: settings.quietHoursStart, requestConsentEnabled: settings.requestConsentEnabled });
    if (allowWithoutConsent === true) await this.releaseConsentBlockedDeliveries(context.tenantId);
    return envelope("updateSettings", { settings: serialize(settings) });
  }

  async getChannelCapabilities(context: MarketingContext) {
    await this.requireModuleAccess(context);
    const channels = await prisma.channelConnection.findMany({ where: { tenantId: context.tenantId, status: "active" }, select: { id: true, status: true, type: true } });
    return envelope("getMarketingChannelCapabilities", { channels: channels.map(marketingChannelCapability) });
  }

  async createAudience(payload: { clientIds?: unknown; matchOverrides?: unknown; name?: unknown; records?: unknown; source?: unknown }, context: MarketingContext) {
    await this.requireModuleAccess(context);
    const name = text(payload.name, 160);
    const source = ["manual", "import", "crm"].includes(String(payload.source)) ? String(payload.source) : "manual";
    const clientIds = uniqueStrings(payload.clientIds);
    const externalRecords = Array.isArray(payload.records) ? payload.records.slice(0, 100_000).filter(isRecord) : [];
    const importedIds = await this.resolveImportedClients(externalRecords, context.tenantId, payload.matchOverrides);
    const requestedIds = [...new Set([...clientIds, ...importedIds])];
    if (!name || !requestedIds.length) return invalidEnvelope("createAudience", "marketing_audience_invalid", "Audience name and at least one matched client are required.");
    const matched = await prisma.clientProfile.findMany({ where: { tenantId: context.tenantId, id: { in: requestedIds } }, select: { id: true } });
    const audience = await prisma.$transaction(async (tx: any) => {
      const created = await tx.marketingAudience.create({ data: { id: `mkt_audience_${randomUUID()}`, tenantId: context.tenantId, name, source, createdBy: context.userId } });
      if (matched.length) {
        await tx.marketingAudienceMember.createMany({ data: matched.map((client: { id: string }) => ({ id: `mkt_member_${randomUUID()}`, tenantId: context.tenantId, audienceId: created.id, clientId: client.id, source, matchedBy: source === "manual" ? "client_profile_id" : "exact_unique_identifier" })), skipDuplicates: true });
      }
      return created;
    });
    await this.recordAudit(context, "marketing.audience.created", "audience", audience.id, { matchedCount: matched.length, source });
    return envelope("createAudience", { audience: serialize(audience), matchedCount: matched.length, unmatchedClientIds: requestedIds.filter((id) => !matched.some((client: { id: string }) => client.id === id)), skippedRecords: Math.max(0, externalRecords.length - importedIds.length) });
  }

  async previewAudienceImport(payload: { records?: unknown }, context: MarketingContext) {
    await this.requireModuleAccess(context);
    const records = Array.isArray(payload.records) ? payload.records.slice(0, 100_000).filter(isRecord) : [];
    if (!records.length) return invalidEnvelope("previewAudienceImport", "marketing_import_records_required", "Provide one to 100,000 import records for matching.");
    const matches = await this.resolveImportedClientMatches(records, context.tenantId);
    const summary = matches.reduce((result, item) => ({
      matched: result.matched + (item.candidates.length === 1 ? 1 : 0),
      ambiguous: result.ambiguous + (item.candidates.length > 1 ? 1 : 0),
      unmatched: result.unmatched + (item.candidates.length === 0 ? 1 : 0)
    }), { matched: 0, ambiguous: 0, unmatched: 0 });
    await this.recordAudit(context, "marketing.audience.import_previewed", "audience_import", context.tenantId, { recordCount: records.length, ...summary });
    return envelope("previewAudienceImport", {
      records: matches.slice(0, 1_000).map((item) => ({ index: item.index, status: item.candidates.length === 1 ? "matched" : item.candidates.length ? "ambiguous" : "unmatched", candidates: item.candidates.map((candidate) => ({ id: candidate.id, name: candidate.name, phone: candidate.phone })) })),
      summary: { ...summary, recordCount: records.length, reviewRequired: summary.ambiguous + summary.unmatched }
    });
  }

  async archiveAudience(audienceId: string, context: MarketingContext) {
    await this.requireModuleAccess(context);
    const audience = await prisma.marketingAudience.findFirst({ where: { id: audienceId, tenantId: context.tenantId } });
    if (!audience) return notFoundEnvelope("archiveAudience", "marketing_audience_not_found", "Audience was not found.");
    const activeCampaigns = await prisma.marketingCampaign.count({ where: { tenantId: context.tenantId, audienceId, status: { in: ["draft", "scheduled", "sending", "paused"] } } });
    if (activeCampaigns) return invalidEnvelope("archiveAudience", "marketing_audience_in_use", "Cancel or complete campaigns using this audience before archiving it.");
    const archived = await prisma.marketingAudience.update({ where: { id: audience.id }, data: { status: "archived" } });
    await this.recordAudit(context, "marketing.audience.archived", "audience", audience.id);
    return envelope("archiveAudience", { audience: serialize(archived) });
  }

  async createAudienceSync(audienceId: string, context: MarketingContext) {
    await this.requireOwner(context);
    const audience = await prisma.marketingAudience.findFirst({ where: { id: audienceId, tenantId: context.tenantId, status: "active" } });
    if (!audience) return notFoundEnvelope("createAudienceSync", "marketing_audience_not_found", "Audience was not found.");
    const secret = `mcrm_${randomUUID().replaceAll("-", "")}${randomUUID().replaceAll("-", "")}`;
    const sync = await prisma.marketingAudienceSync.upsert({
      where: { tenantId_audienceId: { tenantId: context.tenantId, audienceId } },
      create: { id: `mkt_sync_${randomUUID()}`, tenantId: context.tenantId, audienceId, secretHash: hashMarketingApiKey(secret), createdBy: context.userId },
      update: { status: "active", secretHash: hashMarketingApiKey(secret), createdBy: context.userId, lastError: null }
    });
    await this.recordAudit(context, "marketing.audience_sync.rotated", "audience", audience.id, { syncId: sync.id });
    return envelope("createAudienceSync", { sync: { ...serialize(sync), secret, webhookPath: `/api/v1/marketing/inbound/crm/${sync.id}` } });
  }

  async syncAudienceFromCrm(syncId: string, secret: string, eventId: string, timestamp: string, signature: string, payload: Record<string, unknown>) {
    const sync = await prisma.marketingAudienceSync.findFirst({ where: { id: syncId, status: "active" } });
    if (!sync || !safeHashEqual(hashMarketingApiKey(secret), sync.secretHash)) return deniedEnvelope("syncAudienceFromCrm", "marketing_crm_sync_unauthorized");
    const event = text(eventId, 160);
    const occurredAt = Number(timestamp);
    if (!event || !Number.isFinite(occurredAt) || Math.abs(Date.now() - occurredAt) > 5 * 60 * 1_000) return invalidEnvelope("syncAudienceFromCrm", "marketing_crm_signature_expired", "X-Marketing-Event-Id and a current Unix-millisecond X-Marketing-Timestamp are required.");
    const payloadHash = hashMarketingApiKey(canonicalJson(payload));
    const expectedSignature = createHmac("sha256", secret).update(`${timestamp}.${event}.${canonicalJson(payload)}`).digest("hex");
    if (!safeHashEqual(signature, expectedSignature)) return deniedEnvelope("syncAudienceFromCrm", "marketing_crm_signature_invalid");
    if (!Array.isArray(payload.records)) return invalidEnvelope("syncAudienceFromCrm", "marketing_crm_records_required", "records must be an array (an empty array is a valid authoritative audience snapshot).");
    const records = payload.records.slice(0, 100_000).filter(isRecord);
    const now = new Date();
    try {
      await prisma.marketingAudienceSyncEvent.create({ data: { id: `mkt_sync_event_${randomUUID()}`, tenantId: sync.tenantId, syncId: sync.id, eventId: event, payloadHash } });
    } catch (error) {
      const previous = await prisma.marketingAudienceSyncEvent.findUnique({ where: { syncId_eventId: { syncId: sync.id, eventId: event } } });
      if (!previous || previous.payloadHash !== payloadHash) return invalidEnvelope("syncAudienceFromCrm", "marketing_crm_event_conflict", "This CRM event ID was already used with a different payload.");
      if (previous.status === "completed") return envelope("syncAudienceFromCrm", { accepted: true, duplicate: true, audienceId: sync.audienceId });
      await prisma.marketingAudienceSyncEvent.update({ where: { id: previous.id }, data: { status: "processing", lastError: null } });
    }
    try {
      const matchedIds = await this.resolveImportedClients(records, sync.tenantId);
      await prisma.$transaction(async (tx: any) => {
        await tx.marketingAudienceMember.deleteMany({ where: { tenantId: sync.tenantId, audienceId: sync.audienceId, source: "crm" } });
        if (matchedIds.length) await tx.marketingAudienceMember.createMany({ data: [...new Set(matchedIds)].map((clientId) => ({ id: `mkt_member_${randomUUID()}`, tenantId: sync.tenantId, audienceId: sync.audienceId, clientId, source: "crm", matchedBy: "exact_unique_identifier" })), skipDuplicates: true });
        await tx.marketingAudience.update({ where: { id: sync.audienceId }, data: { source: "crm" } });
        await tx.marketingAudienceSync.update({ where: { id: sync.id }, data: { lastAttemptAt: now, lastSuccessAt: now, lastError: null } });
        await tx.marketingAudienceSyncEvent.update({ where: { syncId_eventId: { syncId: sync.id, eventId: event } }, data: { status: "completed", lastError: null } });
      });
      return envelope("syncAudienceFromCrm", { accepted: true, audienceId: sync.audienceId, matchedCount: new Set(matchedIds).size, unmatchedCount: Math.max(0, records.length - new Set(matchedIds).size), snapshotAt: now.toISOString() });
    } catch (error) {
      await prisma.marketingAudienceSync.update({ where: { id: sync.id }, data: { lastAttemptAt: now, lastError: error instanceof Error ? error.message.slice(0, 500) : "crm_sync_failed" } });
      await prisma.marketingAudienceSyncEvent.updateMany({ where: { syncId: sync.id, eventId: event }, data: { status: "failed", lastError: error instanceof Error ? error.message.slice(0, 500) : "crm_sync_failed" } });
      throw error;
    }
  }

  async createTemplate(payload: { content?: unknown; title?: unknown }, context: MarketingContext) {
    await this.requireModuleAccess(context);
    const title = text(payload.title, 160);
    if (!title) return invalidEnvelope("createTemplate", "marketing_template_title_required", "Template title is required.");
    const content = normalizeContent(payload.content);
    const template = await prisma.$transaction(async (tx: any) => {
      const created = await tx.marketingTemplate.create({ data: { id: `mkt_template_${randomUUID()}`, tenantId: context.tenantId, title, content, createdBy: context.userId } });
      await tx.marketingTemplateVersion.create({ data: { id: `mkt_template_version_${randomUUID()}`, tenantId: context.tenantId, templateId: created.id, version: created.version, title: created.title, content, createdBy: context.userId } });
      return created;
    });
    await this.recordAudit(context, "marketing.template.created", "template", template.id);
    return envelope("createTemplate", { template: serialize(template) });
  }

  async updateTemplate(templateId: string, payload: { content?: unknown; title?: unknown }, context: MarketingContext) {
    await this.requireModuleAccess(context);
    const current = await prisma.marketingTemplate.findFirst({ where: { id: templateId, tenantId: context.tenantId } });
    if (!current) return notFoundEnvelope("updateTemplate", "marketing_template_not_found", "Template was not found.");
    const template = await prisma.$transaction(async (tx: any) => {
      const nextTitle = payload.title === undefined ? current.title : text(payload.title, 160) || current.title;
      const nextContent = payload.content === undefined ? current.content : normalizeContent(payload.content);
      const changed = payload.title !== undefined || payload.content !== undefined;
      await tx.marketingTemplateVersion.upsert({ where: { templateId_version: { templateId: current.id, version: current.version } }, create: { id: `mkt_template_version_${randomUUID()}`, tenantId: context.tenantId, templateId: current.id, version: current.version, title: current.title, content: current.content, createdBy: current.createdBy }, update: {} });
      const updated = await tx.marketingTemplate.update({ where: { id: current.id }, data: { title: nextTitle, content: nextContent, ...(changed ? { version: { increment: 1 } } : {}) } });
      if (changed) await tx.marketingTemplateVersion.create({ data: { id: `mkt_template_version_${randomUUID()}`, tenantId: context.tenantId, templateId: updated.id, version: updated.version, title: updated.title, content: updated.content, createdBy: context.userId } });
      return updated;
    });
    await this.recordAudit(context, "marketing.template.updated", "template", template.id, { version: template.version });
    return envelope("updateTemplate", { template: serialize(template) });
  }

  async createCampaign(payload: Record<string, unknown>, context: MarketingContext) {
    await this.requireModuleAccess(context);
    const title = text(payload.title, 160);
    const channels = uniqueStrings(payload.channels);
    let audienceId = optionalText(payload.audienceId, 128);
    const personalClientIds = uniqueStrings([...(Array.isArray(payload.clientIds) ? payload.clientIds : []), ...(Array.isArray(payload.sourceProfileIds) ? payload.sourceProfileIds : [])]);
    const strategy = ["manual", "preferred", "cascade", "all"].includes(String(payload.strategy)) ? String(payload.strategy) : "manual";
    if (!title || !channels.length) return invalidEnvelope("createCampaign", "marketing_campaign_invalid", "Campaign title and at least one channel are required.");
    if (!await this.hasActiveChannels(context.tenantId, channels)) return invalidEnvelope("createCampaign", "marketing_channel_unavailable", "Every campaign channel must be an active tenant connection.");
    const content = normalizeContent(payload.content);
    const capabilityError = await this.contentCapabilityError(context.tenantId, channels, content);
    if (capabilityError) return invalidEnvelope("createCampaign", "marketing_channel_content_unsupported", capabilityError);
    if (!await this.hasSafeContentAttachments(content, context.tenantId)) return invalidEnvelope("createCampaign", "marketing_attachment_not_ready", "Every attached file must belong to the tenant and pass storage and antivirus checks.");
    if (audienceId) {
      const audience = await prisma.marketingAudience.findFirst({ where: { id: audienceId, tenantId: context.tenantId, status: "active" } });
      if (!audience) return invalidEnvelope("createCampaign", "marketing_audience_not_found", "Audience was not found.");
    }
    if (!audienceId && personalClientIds.length) {
      const clients = await prisma.clientProfile.findMany({ where: { tenantId: context.tenantId, OR: [{ id: { in: personalClientIds } }, { sourceProfileId: { in: personalClientIds } }] }, select: { id: true } });
      if (!clients.length) return invalidEnvelope("createCampaign", "marketing_personal_recipient_not_found", "At least one personal recipient must be an existing client profile.");
      const personalAudience = await prisma.$transaction(async (tx: any) => {
        const created = await tx.marketingAudience.create({ data: { id: `mkt_audience_${randomUUID()}`, tenantId: context.tenantId, name: `Personal · ${title}`, source: "manual", createdBy: context.userId } });
        await tx.marketingAudienceMember.createMany({ data: clients.map((client: { id: string }) => ({ id: `mkt_member_${randomUUID()}`, tenantId: context.tenantId, audienceId: created.id, clientId: client.id, source: "manual", matchedBy: "client_profile_id" })), skipDuplicates: true });
        return created;
      });
      audienceId = personalAudience.id;
    }
    const scheduledAt = parseFutureDate(payload.scheduledAt);
    const campaign = await prisma.marketingCampaign.create({ data: { id: `mkt_campaign_${randomUUID()}`, tenantId: context.tenantId, title, audienceId, channels, strategy, content, scheduledAt, status: scheduledAt ? "scheduled" : "draft", createdBy: context.userId } });
    await this.recordAudit(context, "marketing.campaign.created", "campaign", campaign.id, { channelCount: channels.length, hasAudience: Boolean(audienceId) });
    return envelope("createCampaign", { campaign: serialize(campaign) });
  }

  async updateCampaign(campaignId: string, payload: Record<string, unknown>, context: MarketingContext) {
    await this.requireModuleAccess(context);
    const campaign = await this.findCampaign(campaignId, context.tenantId);
    if (!campaign) return notFoundEnvelope("updateCampaign", "marketing_campaign_not_found", "Campaign was not found.");
    if (!["draft", "scheduled"].includes(campaign.status)) return invalidEnvelope("updateCampaign", "marketing_campaign_immutable", "An active campaign cannot be edited.");
    const channels = payload.channels === undefined ? campaign.channels : uniqueStrings(payload.channels);
    if (!channels.length || !await this.hasActiveChannels(context.tenantId, channels)) return invalidEnvelope("updateCampaign", "marketing_channel_unavailable", "Every campaign channel must be an active tenant connection.");
    const content = payload.content === undefined ? campaign.content : normalizeContent(payload.content);
    const capabilityError = await this.contentCapabilityError(context.tenantId, channels, content);
    if (capabilityError) return invalidEnvelope("updateCampaign", "marketing_channel_content_unsupported", capabilityError);
    if (!await this.hasSafeContentAttachments(content, context.tenantId)) return invalidEnvelope("updateCampaign", "marketing_attachment_not_ready", "Every attached file must belong to the tenant and pass storage and antivirus checks.");
    const updated = await prisma.marketingCampaign.update({ where: { id: campaign.id }, data: {
      ...(payload.title === undefined ? {} : { title: text(payload.title, 160) || campaign.title }),
      ...(payload.content === undefined ? {} : { content }),
      ...(payload.audienceId === undefined ? {} : { audienceId: optionalText(payload.audienceId, 128) }),
      channels,
      ...(payload.strategy === undefined ? {} : { strategy: ["manual", "preferred", "cascade", "all"].includes(String(payload.strategy)) ? String(payload.strategy) : campaign.strategy }),
      ...(payload.scheduledAt === undefined ? {} : { scheduledAt: parseFutureDate(payload.scheduledAt), status: parseFutureDate(payload.scheduledAt) ? "scheduled" : "draft" })
    } });
    await this.recordAudit(context, "marketing.campaign.updated", "campaign", updated.id);
    return envelope("updateCampaign", { campaign: serialize(updated) });
  }

  async cloneCampaign(campaignId: string, context: MarketingContext) {
    await this.requireModuleAccess(context);
    const campaign = await this.findCampaign(campaignId, context.tenantId);
    if (!campaign) return notFoundEnvelope("cloneCampaign", "marketing_campaign_not_found", "Campaign was not found.");
    if (campaign.audienceId) {
      const audience = await prisma.marketingAudience.findFirst({ where: { id: campaign.audienceId, tenantId: context.tenantId, status: "active" }, select: { id: true } });
      if (!audience) return invalidEnvelope("cloneCampaign", "marketing_campaign_audience_archived", "The campaign audience is archived and cannot be reused.");
    }
    const clone = await prisma.marketingCampaign.create({ data: { id: `mkt_campaign_${randomUUID()}`, tenantId: context.tenantId, title: `${campaign.title} · copy`.slice(0, 160), audienceId: campaign.audienceId, channels: campaign.channels, strategy: campaign.strategy, content: campaign.content, status: "draft", createdBy: context.userId } });
    await this.recordAudit(context, "marketing.campaign.cloned", "campaign", clone.id, { sourceCampaignId: campaign.id });
    return envelope("cloneCampaign", { campaign: serialize(clone), sourceCampaignId: campaign.id });
  }

  async launchCampaign(campaignId: string, idempotencyKey: string | undefined, context: MarketingContext) {
    await this.requireModuleAccess(context);
    const campaign = await this.findCampaign(campaignId, context.tenantId);
    if (!campaign) return notFoundEnvelope("launchCampaign", "marketing_campaign_not_found", "Campaign was not found.");
    if (!["draft", "scheduled"].includes(campaign.status)) return invalidEnvelope("launchCampaign", "marketing_campaign_not_launchable", "Campaign cannot be launched in its current status.");
    if (campaign.scheduledAt && campaign.scheduledAt.getTime() > Date.now()) return invalidEnvelope("launchCampaign", "marketing_campaign_not_due", "This campaign is scheduled for a future time.");
    if (!await this.hasActiveChannels(context.tenantId, campaign.channels)) return invalidEnvelope("launchCampaign", "marketing_channel_unavailable", "A selected campaign channel is not active for this tenant.");
    const capabilityError = await this.contentCapabilityError(context.tenantId, campaign.channels, campaign.content);
    if (capabilityError) return invalidEnvelope("launchCampaign", "marketing_channel_content_unsupported", capabilityError);
    const [quietSettings, tenant] = await Promise.all([
      this.ensureSettings(context.tenantId),
      prisma.tenant.findUnique({ where: { id: context.tenantId }, select: { metadata: true } })
    ]);
    if (!campaign.audienceId) return invalidEnvelope("launchCampaign", "marketing_campaign_audience_required", "A static audience is required for a mass campaign.");
    const audience = await prisma.marketingAudience.findFirst({ where: { id: campaign.audienceId, tenantId: context.tenantId }, select: { id: true, source: true } });
    if (!audience) return notFoundEnvelope("launchCampaign", "marketing_audience_not_found", "Campaign audience was not found.");
    if (audience.source === "crm") {
      const sync = await prisma.marketingAudienceSync.findUnique({ where: { tenantId_audienceId: { tenantId: context.tenantId, audienceId: audience.id } }, select: { lastError: true, lastSuccessAt: true } });
      const freshAfter = Date.now() - 24 * 60 * 60 * 1000;
      if (!sync?.lastSuccessAt || sync.lastSuccessAt.getTime() < freshAfter) {
        return invalidEnvelope("launchCampaign", "marketing_crm_audience_stale", "The CRM audience must be synchronized successfully within the last 24 hours before launch.");
      }
    }
    const members = await prisma.marketingAudienceMember.findMany({ where: { tenantId: context.tenantId, audienceId: campaign.audienceId }, select: { clientId: true } });
    if (members.length > 100_000) return invalidEnvelope("launchCampaign", "marketing_campaign_limit_exceeded", "A campaign cannot contain more than 100,000 matched clients.");
    const consents = await prisma.marketingConsent.findMany({ where: { tenantId: context.tenantId, clientId: { in: members.map((member: { clientId: string }) => member.clientId) }, channel: { in: campaign.channels } }, select: { clientId: true, channel: true, status: true } });
    const consentStatusByKey = new Map(consents.map((consent: { clientId: string; channel: string; status: string }) => [`${consent.clientId}:${consent.channel}`, consent.status] as const));
    const consentPolicy = marketingConsentPolicy(quietSettings);
    const now = new Date();
    const keyPrefix = text(idempotencyKey, 160) || `launch_${campaign.id}_${now.toISOString()}`;
    const profiles = await prisma.clientProfile.findMany({ where: { tenantId: context.tenantId, id: { in: members.map((member: { clientId: string }) => member.clientId) } }, select: { id: true, name: true, phone: true, channel: true, timeZone: true } });
    const profileById = new Map<string, { id: string; name: string; phone: string; channel: string; timeZone: string | null }>(profiles.map((profile: { id: string; name: string; phone: string; channel: string; timeZone: string | null }) => [profile.id, profile] as const));
    const fallbackTimeZone = tenantTimeZone(tenant?.metadata);
    const quietUntilByClientId = new Map<string, Date>();
    for (const profile of profiles as Array<{ id: string; timeZone: string | null }>) {
      const next = quietHoursEnd(new Date(), quietSettings.quietHoursStart, quietSettings.quietHoursEnd, tenantTimeZone({ timeZone: profile.timeZone || fallbackTimeZone }));
      if (next) quietUntilByClientId.set(profile.id, next);
    }
    const attachments = contentAttachments(campaign.content);
    const message = contentToText(campaign.content) || (attachments.length ? "Вложение" : "");
    if (!message) return invalidEnvelope("launchCampaign", "marketing_content_required", "Campaign content must include text or an attachment before launch.");
    const rows = members.flatMap((member: { clientId: string }) => {
      const profile = profileById.get(member.clientId);
      const selectedChannels = campaign.strategy === "preferred" && profile?.channel && campaign.channels.includes(profile.channel)
        ? [profile.channel] : campaign.channels;
      const eligibleChannels = selectedChannels.filter((channel: string) => marketingConsentAllowsDelivery(consentStatusByKey.get(`${member.clientId}:${channel}`), consentPolicy.allowWithoutConsent) && Boolean(profile?.phone));
      return selectedChannels.map((channel: string) => {
        const consentStatus = consentStatusByKey.get(`${member.clientId}:${channel}`);
        const consentAllowsDelivery = marketingConsentAllowsDelivery(consentStatus, consentPolicy.allowWithoutConsent);
        const hasDestination = Boolean(profile?.phone);
        const cascadeWaiting = campaign.strategy === "cascade" && eligibleChannels.indexOf(channel) > 0;
        const queued = consentAllowsDelivery && hasDestination && !cascadeWaiting;
        return {
          id: `mkt_delivery_${randomUUID()}`, tenantId: context.tenantId, campaignId: campaign.id, clientId: member.clientId, channel,
          status: cascadeWaiting ? "waiting" : queued ? "queued" : "excluded",
          excludedReason: consentAllowsDelivery ? (hasDestination ? null : "destination_missing") : "consent_required",
          outboundDescriptorId: null,
          scheduledAt: queued ? quietUntilByClientId.get(member.clientId) ?? null : null,
          idempotencyKey: `${keyPrefix}:${member.clientId}:${channel}`,
          profile,
          message,
          attachments
        };
      });
    });
    const billingSettings = await this.ensureSettings(context.tenantId);
    await prisma.$transaction(async (tx: any) => {
      if (rows.length) await tx.marketingDelivery.createMany({ data: rows.map(({ profile: _profile, message: _message, attachments: _attachments, ...row }: any) => row), skipDuplicates: true });
      for (const row of rows.filter((row: any) => row.status === "queued" && row.outboundDescriptorId)) {
        const outbox = createOutboxEvent({
          aggregateId: row.id,
          aggregateType: "marketing_delivery",
          payload: { channel: row.channel, descriptorId: row.outboundDescriptorId, marketingDeliveryId: row.id, maxAttempts: 3 },
          queue: "message-delivery",
          traceId: createRequestTraceId(SERVICE, "launchCampaign"),
          type: "conversation.outbound.requested"
        });
        await tx.conversationOutboundDescriptor.create({ data: {
          id: row.outboundDescriptorId,
          kind: "outbound_conversation",
          tenantId: context.tenantId,
          conversationId: null,
          messageId: null,
          channel: row.channel,
          status: "queued",
          deliveryState: "queued",
          idempotencyKey: `marketing:${row.idempotencyKey}`,
          requestFingerprint: `marketing:${row.id}`,
          retryable: true,
          payload: { attachments: row.attachments, channel: row.channel, clientName: row.profile?.name ?? "", marketingCampaignId: campaign.id, marketingDeliveryId: row.id, message: row.message, phone: row.profile?.phone ?? "", queue: "message-delivery", replyMarkup: contentReplyMarkup(campaign.content), topic: "marketing" },
          auditId: null,
          traceId: outbox.traceId,
          outboxEventId: outbox.id
        } });
        await tx.outboxEvent.create({ data: { id: outbox.id, aggregateId: outbox.aggregateId, aggregateType: outbox.aggregateType, occurredAt: new Date(outbox.occurredAt), payload: outbox.payload, queue: outbox.queue, status: outbox.status, traceId: outbox.traceId, type: outbox.type } });
      }
      const consentRequests: typeof rows = rows.filter((row: any) =>
        consentPolicy.requestConsentEnabled
        && !consentPolicy.allowWithoutConsent
        && row.status === "excluded"
        && row.excludedReason === "consent_required"
        && Boolean(row.profile?.phone)
        && !consentStatusByKey.has(`${row.clientId}:${row.channel}`)
      );
      for (const row of consentRequests) {
        const consentId = `mkt_consent_${randomUUID()}`;
        const descriptorId = `mkt_consent_outbound_${randomUUID()}`;
        const outbox = createOutboxEvent({ aggregateId: consentId, aggregateType: "marketing_consent", payload: { channel: row.channel, descriptorId, maxAttempts: 3 }, queue: "message-delivery", traceId: createRequestTraceId(SERVICE, "requestMarketingConsent"), type: "conversation.outbound.requested" });
        await tx.marketingConsent.create({ data: { id: consentId, tenantId: context.tenantId, clientId: row.clientId, channel: row.channel, status: "pending", source: "system", consentVersion: quietSettings.consentVersion, evidence: { campaignId: campaign.id, requestedBy: context.userId }, recordedAt: now } });
        await tx.conversationOutboundDescriptor.create({ data: { id: descriptorId, kind: "outbound_conversation", tenantId: context.tenantId, conversationId: null, messageId: null, channel: row.channel, status: "queued", deliveryState: "queued", idempotencyKey: `marketing-consent:${consentId}`, requestFingerprint: `marketing-consent:${row.clientId}:${row.channel}`, retryable: true, payload: { channel: row.channel, clientName: row.profile.name ?? "", marketingConsentId: consentId, message: quietSettings.consentText || DEFAULT_MARKETING_CONSENT_TEXT, phone: row.profile.phone, queue: "message-delivery", topic: "marketing-consent" }, auditId: null, traceId: outbox.traceId, outboxEventId: outbox.id } });
        await tx.outboxEvent.create({ data: { id: outbox.id, aggregateId: outbox.aggregateId, aggregateType: outbox.aggregateType, occurredAt: new Date(outbox.occurredAt), payload: outbox.payload, queue: outbox.queue, status: outbox.status, traceId: outbox.traceId, type: outbox.type } });
      }
      await this.createUsageCharges(tx, context.tenantId, rows.filter((row: any) => row.status === "queued"), billingSettings, now);
      await tx.marketingCampaign.update({ where: { id: campaign.id }, data: { status: "sending", launchedAt: now } });
    });
    const queued = rows.filter((row: { status: string }) => row.status === "queued").length;
    const deferred = rows.filter((row: { scheduledAt: Date | null; status: string }) => row.status === "queued" && row.scheduledAt).length;
    const excluded = rows.filter((row: { status: string }) => row.status === "excluded").length;
    await this.recordAudit(context, "marketing.campaign.launched", "campaign", campaign.id, { deferred, excluded, queued });
    return envelope("launchCampaign", { campaignId: campaign.id, crmAudienceStaleWarning: audience.source === "crm" && Boolean((await prisma.marketingAudienceSync.findUnique({ where: { tenantId_audienceId: { tenantId: context.tenantId, audienceId: audience.id } }, select: { lastError: true } }))?.lastError), deferredByQuietHours: deferred, excluded, queued, snapshotAt: now.toISOString() });
  }

  async sendTestCampaign(campaignId: string, payload: Record<string, unknown>, idempotencyKey: string | undefined, context: MarketingContext) {
    await this.requireModuleAccess(context);
    const campaign = await this.findCampaign(campaignId, context.tenantId);
    if (!campaign) return notFoundEnvelope("sendTestCampaign", "marketing_campaign_not_found", "Campaign was not found.");
    if (!["draft", "scheduled"].includes(campaign.status)) return invalidEnvelope("sendTestCampaign", "marketing_campaign_immutable", "Only a draft or scheduled campaign can be tested.");
    if (!await this.hasActiveChannels(context.tenantId, campaign.channels)) return invalidEnvelope("sendTestCampaign", "marketing_channel_unavailable", "A selected campaign channel is not active for this tenant.");
    const capabilityError = await this.contentCapabilityError(context.tenantId, campaign.channels, campaign.content);
    if (capabilityError) return invalidEnvelope("sendTestCampaign", "marketing_channel_content_unsupported", capabilityError);
    const clientRefs = uniqueStrings(payload.clientIds).slice(0, 20);
    if (!clientRefs.length) return invalidEnvelope("sendTestCampaign", "marketing_test_recipients_required", "Choose one to twenty existing client profiles for a test.");
    const [settings, tenant, profiles] = await Promise.all([
      this.ensureSettings(context.tenantId),
      prisma.tenant.findUnique({ where: { id: context.tenantId }, select: { metadata: true } }),
      prisma.clientProfile.findMany({ where: { tenantId: context.tenantId, OR: [{ id: { in: clientRefs } }, { sourceProfileId: { in: clientRefs } }] }, select: { id: true, name: true, phone: true, channel: true, timeZone: true } })
    ]);
    if (!profiles.length) return invalidEnvelope("sendTestCampaign", "marketing_test_recipient_not_found", "Test recipients must be existing client profiles.");
    const fallbackTimeZone = tenantTimeZone(tenant?.metadata);
    if (profiles.some((profile: { timeZone: string | null }) => quietHoursEnd(new Date(), settings.quietHoursStart, settings.quietHoursEnd, tenantTimeZone({ timeZone: profile.timeZone || fallbackTimeZone })))) return invalidEnvelope("sendTestCampaign", "marketing_quiet_hours_active", "Tests cannot be sent during recipients' quiet hours.");
    const recipientPhones = uniqueStrings(profiles.map((profile: { phone: string }) => profile.phone));
    const recentConversations = recipientPhones.length ? await prisma.conversation.findMany({
      where: { tenantId: context.tenantId, phone: { in: recipientPhones }, providerConversationId: { not: null } },
      orderBy: { updatedAt: "desc" },
      select: { channel: true, channelConnectionId: true, phone: true, providerConversationId: true }
    }) : [];
    const destinationByKey = new Map<string, { channelConnectionId: string | null; providerConversationId: string }>();
    for (const conversation of recentConversations as Array<{ channel: string; channelConnectionId: string | null; phone: string; providerConversationId: string | null }>) {
      if (!conversation.providerConversationId) continue;
      const key = marketingDestinationKey(conversation.phone, conversation.channel);
      if (!destinationByKey.has(key)) destinationByKey.set(key, { channelConnectionId: conversation.channelConnectionId, providerConversationId: conversation.providerConversationId });
    }
    const consents = await prisma.marketingConsent.findMany({ where: { tenantId: context.tenantId, clientId: { in: profiles.map((profile: { id: string }) => profile.id) }, channel: { in: campaign.channels } }, select: { clientId: true, channel: true, status: true } });
    const consentStatusByKey = new Map(consents.map((consent: { clientId: string; channel: string; status: string }) => [`${consent.clientId}:${consent.channel}`, consent.status] as const));
    const { allowWithoutConsent } = marketingConsentPolicy(settings);
    const message = contentToText(campaign.content) || (contentAttachments(campaign.content).length ? "Вложение" : "");
    if (!message) return invalidEnvelope("sendTestCampaign", "marketing_content_required", "Campaign content must include text or an attachment before testing.");
    const testKey = text(idempotencyKey, 160) || `test_${randomUUID()}`;
    let queued = 0;
    let excluded = 0;
    await prisma.$transaction(async (tx: any) => {
      for (const profile of profiles) {
        const eligibleChannels = (campaign.strategy === "preferred" && profile.channel && campaign.channels.includes(profile.channel) ? [profile.channel] : campaign.channels)
          .filter((channel: string) => {
            const destination = destinationByKey.get(marketingDestinationKey(profile.phone, channel));
            const requiresConnection = ["max", "vk"].includes(channel.toLowerCase());
            return Boolean(profile.phone)
              && Boolean(destination?.providerConversationId)
              && (!requiresConnection || Boolean(destination?.channelConnectionId))
              && marketingConsentAllowsDelivery(consentStatusByKey.get(`${profile.id}:${channel}`), allowWithoutConsent);
          });
        const channels = campaign.strategy === "cascade" ? eligibleChannels.slice(0, 1) : eligibleChannels;
        excluded += Math.max(0, campaign.channels.length - channels.length);
        for (const channel of channels) {
          const destination = destinationByKey.get(marketingDestinationKey(profile.phone, channel));
          if (!destination) continue;
          const descriptorKey = `marketing-test:${campaign.id}:${testKey}:${profile.id}:${channel}`;
          const existing = await tx.conversationOutboundDescriptor.findUnique({ where: { idempotencyKey: descriptorKey }, select: { id: true } });
          if (existing) continue;
          const descriptorId = `mkt_test_outbound_${randomUUID()}`;
          const outbox = createOutboxEvent({ aggregateId: descriptorId, aggregateType: "marketing_test_delivery", payload: { channel, descriptorId, maxAttempts: 3 }, queue: "message-delivery", traceId: createRequestTraceId(SERVICE, "sendTestCampaign"), type: "conversation.outbound.requested" });
          await tx.conversationOutboundDescriptor.create({ data: { id: descriptorId, kind: "outbound_conversation", tenantId: context.tenantId, conversationId: null, messageId: null, channel, status: "queued", deliveryState: "queued", idempotencyKey: descriptorKey, requestFingerprint: `marketing-test:${campaign.id}:${profile.id}:${channel}`, retryable: true, payload: { attachments: contentAttachments(campaign.content), channel, channelConnectionId: destination.channelConnectionId, clientName: profile.name ?? "", marketingCampaignId: campaign.id, marketingTest: true, message, phone: profile.phone, providerConversationId: destination.providerConversationId, queue: "message-delivery", replyMarkup: contentReplyMarkup(campaign.content), topic: "marketing-test" }, auditId: null, traceId: outbox.traceId, outboxEventId: outbox.id } });
          await tx.outboxEvent.create({ data: { id: outbox.id, aggregateId: outbox.aggregateId, aggregateType: outbox.aggregateType, occurredAt: new Date(outbox.occurredAt), payload: outbox.payload, queue: outbox.queue, status: outbox.status, traceId: outbox.traceId, type: outbox.type } });
          queued += 1;
        }
      }
    });
    await this.recordAudit(context, "marketing.campaign.test_sent", "campaign", campaign.id, { excluded, queued });
    return envelope("sendTestCampaign", { campaignId: campaign.id, excluded, queued, test: true });
  }

  async retryFailedCampaignDeliveries(campaignId: string, context: MarketingContext) {
    await this.requireModuleAccess(context);
    const campaign = await this.findCampaign(campaignId, context.tenantId);
    if (!campaign) return notFoundEnvelope("retryFailedCampaignDeliveries", "marketing_campaign_not_found", "Campaign was not found.");
    if (["cancelled", "paused"].includes(campaign.status)) return invalidEnvelope("retryFailedCampaignDeliveries", "marketing_campaign_retry_unavailable", "Resume an active campaign or clone a cancelled campaign before retrying failed recipients.");
    if (!await this.hasActiveChannels(context.tenantId, campaign.channels)) return invalidEnvelope("retryFailedCampaignDeliveries", "marketing_channel_unavailable", "A selected campaign channel is not active for this tenant.");
    const failed = await prisma.marketingDelivery.findMany({ where: { tenantId: context.tenantId, campaignId: campaign.id, status: "failed" }, orderBy: { updatedAt: "asc" }, take: 1_000, select: { id: true, clientId: true, channel: true, idempotencyKey: true } });
    if (!failed.length) return envelope("retryFailedCampaignDeliveries", { campaignId: campaign.id, retried: 0, skipped: 0 });
    const profiles = await prisma.clientProfile.findMany({ where: { tenantId: context.tenantId, id: { in: failed.map((delivery: { clientId: string }) => delivery.clientId) } }, select: { id: true, name: true, phone: true } });
    const profileById = new Map<string, { id: string; name: string; phone: string }>(profiles.map((profile: { id: string; name: string; phone: string }) => [profile.id, profile] as const));
    const attachments = contentAttachments(campaign.content);
    const message = contentToText(campaign.content) || (attachments.length ? "Вложение" : "");
    if (!message) return invalidEnvelope("retryFailedCampaignDeliveries", "marketing_content_required", "Campaign content is unavailable for a retry.");
    let retried = 0;
    let skipped = 0;
    for (const delivery of failed) {
      const profile = profileById.get(delivery.clientId);
      if (!profile?.phone) {
        const updated = await prisma.marketingDelivery.updateMany({ where: { id: delivery.id, status: "failed" }, data: { status: "excluded", excludedReason: "destination_missing" } });
        skipped += updated.count;
        continue;
      }
      const descriptorId = `mkt_retry_outbound_${randomUUID()}`;
      const outbox = createOutboxEvent({ aggregateId: delivery.id, aggregateType: "marketing_delivery", payload: { channel: delivery.channel, descriptorId, marketingDeliveryId: delivery.id, maxAttempts: 3 }, queue: "message-delivery", traceId: createRequestTraceId(SERVICE, "retryFailedCampaignDeliveries"), type: "conversation.outbound.requested" });
      const claimed = await prisma.$transaction(async (tx: any) => {
        const changed = await tx.marketingDelivery.updateMany({ where: { id: delivery.id, status: "failed" }, data: { status: "queued", excludedReason: null, outboundDescriptorId: descriptorId, scheduledAt: null } });
        if (!changed.count) return false;
        await tx.conversationOutboundDescriptor.create({ data: { id: descriptorId, kind: "outbound_conversation", tenantId: context.tenantId, conversationId: null, messageId: null, channel: delivery.channel, status: "queued", deliveryState: "queued", idempotencyKey: `marketing-retry:${delivery.idempotencyKey}:${randomUUID()}`, requestFingerprint: `marketing-retry:${delivery.id}`, retryable: true, payload: { attachments, channel: delivery.channel, clientName: profile.name ?? "", marketingCampaignId: campaign.id, marketingDeliveryId: delivery.id, marketingRetry: true, message, phone: profile.phone, queue: "message-delivery", replyMarkup: contentReplyMarkup(campaign.content), topic: "marketing" }, auditId: null, traceId: outbox.traceId, outboxEventId: outbox.id } });
        await tx.outboxEvent.create({ data: { id: outbox.id, aggregateId: outbox.aggregateId, aggregateType: outbox.aggregateType, occurredAt: new Date(outbox.occurredAt), payload: outbox.payload, queue: outbox.queue, status: outbox.status, traceId: outbox.traceId, type: outbox.type } });
        return true;
      });
      if (claimed) retried += 1;
    }
    if (retried) await prisma.marketingCampaign.updateMany({ where: { id: campaign.id, status: "completed" }, data: { status: "sending" } });
    await this.recordAudit(context, "marketing.campaign.failed_retried", "campaign", campaign.id, { retried, skipped });
    return envelope("retryFailedCampaignDeliveries", { campaignId: campaign.id, retried, skipped, remainingFailed: Math.max(0, failed.length - retried - skipped) });
  }

  async resumeCampaign(campaignId: string, context: MarketingContext) {
    await this.requireModuleAccess(context);
    const campaign = await this.findCampaign(campaignId, context.tenantId);
    if (!campaign) return notFoundEnvelope("resumeCampaign", "marketing_campaign_not_found", "Campaign was not found.");
    if (campaign.status !== "paused") return invalidEnvelope("resumeCampaign", "marketing_campaign_not_paused", "Only a paused campaign can be resumed.");
    if (!await this.hasActiveChannels(context.tenantId, campaign.channels)) return invalidEnvelope("resumeCampaign", "marketing_channel_unavailable", "A selected campaign channel is not active for this tenant.");
    const paused = await prisma.marketingDelivery.findMany({
      where: { tenantId: context.tenantId, campaignId: campaign.id, status: "paused" },
      select: { id: true, clientId: true }
    });
    if (!paused.length) return invalidEnvelope("resumeCampaign", "marketing_campaign_no_pending_deliveries", "The campaign has no paused deliveries to resume.");
    const [settings, tenant, profiles] = await Promise.all([
      this.ensureSettings(context.tenantId),
      prisma.tenant.findUnique({ where: { id: context.tenantId }, select: { metadata: true } }),
      prisma.clientProfile.findMany({ where: { tenantId: context.tenantId, id: { in: paused.map((delivery: { clientId: string }) => delivery.clientId) } }, select: { id: true, timeZone: true } })
    ]);
    const fallbackTimeZone = tenantTimeZone(tenant?.metadata);
    const profileById = new Map<string, { id: string; timeZone: string | null }>(profiles.map((profile: { id: string; timeZone: string | null }) => [profile.id, profile] as const));
    const deferredByScheduledAt = new Map<string, { scheduledAt: Date; deliveryIds: string[] }>();
    for (const delivery of paused) {
      const profile = profileById.get(delivery.clientId);
      const scheduledAt = quietHoursEnd(new Date(), settings.quietHoursStart, settings.quietHoursEnd, tenantTimeZone({ timeZone: profile?.timeZone || fallbackTimeZone }));
      if (!scheduledAt) continue;
      const key = scheduledAt.toISOString();
      const group = deferredByScheduledAt.get(key) ?? { scheduledAt, deliveryIds: [] };
      group.deliveryIds.push(delivery.id);
      deferredByScheduledAt.set(key, group);
    }
    const now = new Date();
    await prisma.$transaction(async (tx: any) => {
      await tx.marketingDelivery.updateMany({ where: { id: { in: paused.map((delivery: { id: string }) => delivery.id) } }, data: { status: "queued", outboundDescriptorId: null, scheduledAt: null } });
      for (const group of deferredByScheduledAt.values()) await tx.marketingDelivery.updateMany({ where: { id: { in: group.deliveryIds } }, data: { scheduledAt: group.scheduledAt } });
      await tx.marketingCampaign.update({ where: { id: campaign.id }, data: { status: "sending", pausedAt: null } });
    });
    const deferredByQuietHours = Array.from(deferredByScheduledAt.values()).reduce((total, group) => total + group.deliveryIds.length, 0);
    await this.recordAudit(context, "marketing.campaign.resumed", "campaign", campaign.id, { queued: paused.length - deferredByQuietHours, deferredByQuietHours });
    return envelope("resumeCampaign", { campaignId: campaign.id, queued: paused.length - deferredByQuietHours, deferredByQuietHours });
  }

  async transitionCampaign(campaignId: string, action: "cancel" | "pause", context: MarketingContext) {
    await this.requireModuleAccess(context);
    const campaign = await this.findCampaign(campaignId, context.tenantId);
    if (!campaign) return notFoundEnvelope("transitionCampaign", "marketing_campaign_not_found", "Campaign was not found.");
    if (action === "pause" && campaign.status !== "sending") return invalidEnvelope("transitionCampaign", "marketing_campaign_not_sending", "Only a sending campaign can be paused.");
    if (action === "cancel" && !["draft", "scheduled", "sending", "paused"].includes(campaign.status)) return invalidEnvelope("transitionCampaign", "marketing_campaign_not_cancellable", "Campaign cannot be cancelled in its current status.");
    const now = new Date();
    const data = action === "pause" ? { status: "paused", pausedAt: now } : { status: "cancelled", cancelledAt: now };
    const pendingDeliveries = await prisma.marketingDelivery.findMany({
      where: {
        tenantId: context.tenantId,
        campaignId: campaign.id,
        status: { in: ["queued", "waiting", "paused"] }
      },
      select: { id: true, outboundDescriptorId: true }
    });
    const deliveryIds = pendingDeliveries.map((delivery: { id: string }) => delivery.id);
    const descriptorIds = pendingDeliveries.flatMap((delivery: { outboundDescriptorId: string | null }) => delivery.outboundDescriptorId ? [delivery.outboundDescriptorId] : []);
    const deliveryStatus = action === "pause" ? "paused" : "cancelled";
    const cancellationReason = `marketing_campaign_${action}d`;
    const [updated] = await prisma.$transaction([
      prisma.marketingCampaign.update({ where: { id: campaign.id }, data }),
      prisma.marketingDelivery.updateMany({
        where: { id: { in: deliveryIds }, status: { in: ["queued", "waiting", "paused"] } },
        data: { status: deliveryStatus }
      }),
      prisma.conversationOutboundDescriptor.updateMany({
        where: { id: { in: descriptorIds }, status: "queued", deliveryState: "queued" },
        data: { status: deliveryStatus, deliveryState: deliveryStatus }
      }),
      prisma.outboxEvent.updateMany({
        where: { aggregateType: "marketing_delivery", aggregateId: { in: deliveryIds }, status: "pending" },
        data: { status: "dead_lettered", deadLetteredAt: now, lastError: cancellationReason }
      })
    ]);
    await this.recordAudit(context, action === "pause" ? "marketing.campaign.paused" : "marketing.campaign.cancelled", "campaign", updated.id);
    return envelope("transitionCampaign", { campaign: serialize(updated) });
  }

  async recordConsent(payload: Record<string, unknown>, context: MarketingContext) {
    await this.requireModuleAccess(context);
    const clientId = text(payload.clientId, 128);
    const channel = text(payload.channel, 64);
    const status = ["granted", "withdrawn", "pending"].includes(String(payload.status)) ? String(payload.status) : "withdrawn";
    if (!clientId || !channel) return invalidEnvelope("recordConsent", "marketing_consent_invalid", "Client and channel are required.");
    const client = await prisma.clientProfile.findFirst({ where: { tenantId: context.tenantId, OR: [{ id: clientId }, { sourceProfileId: clientId }] }, select: { id: true } });
    if (!client) return notFoundEnvelope("recordConsent", "marketing_client_not_found", "Client was not found.");
    const settings = await this.ensureSettings(context.tenantId);
    const consent = await prisma.marketingConsent.upsert({
      where: { tenantId_clientId_channel: { tenantId: context.tenantId, clientId: client.id, channel } },
      create: { id: `mkt_consent_${randomUUID()}`, tenantId: context.tenantId, clientId: client.id, channel, status, source: "staff", consentVersion: settings.consentVersion, evidence: { recordedBy: context.userId, legalWarning: status === "withdrawn" }, recordedAt: new Date() },
      update: { status, source: "staff", consentVersion: settings.consentVersion, evidence: { recordedBy: context.userId, legalWarning: status === "withdrawn" }, recordedAt: new Date() }
    });
    await this.recordAudit(context, status === "withdrawn" ? "marketing.consent.withdrawn" : "marketing.consent.recorded", "consent", consent.id, { channel, clientId: client.id, source: "staff", status });
    return envelope("recordConsent", { consent: serialize(consent) });
  }

  private async requireModuleAccess(context: MarketingContext) {
    const access = await this.resolveAccess(context);
    if (!access.allowed) throw new MarketingAccessError(access.reason);
  }

  private async recordAudit(context: MarketingContext, action: string, entityType: string, entityId?: string, details?: Record<string, unknown>) {
    return prisma.marketingAuditEvent.create({ data: {
      id: `mkt_audit_${randomUUID()}`,
      tenantId: context.tenantId,
      actorUserId: context.userId,
      action,
      entityType,
      entityId: entityId || null,
      details: details && Object.keys(details).length ? details : undefined
    } });
  }

  private async requireOwner(context: MarketingContext) {
    const user = await prisma.tenantUser.findUnique({ where: { tenantId_id: { tenantId: context.tenantId, id: context.userId } }, select: { role: true } });
    if (String(user?.role ?? "").toLowerCase() !== "owner") throw new MarketingAccessError("tenant_owner_required");
  }

  private async resolveAccess(context: MarketingContext): Promise<{ allowed: boolean; isOwner: boolean; reason: string }> {
    const [settings, user, grant] = await Promise.all([
      this.ensureSettings(context.tenantId),
      prisma.tenantUser.findUnique({ where: { tenantId_id: { tenantId: context.tenantId, id: context.userId } }, select: { role: true } }),
      prisma.marketingAccess.findUnique({ where: { tenantId_userId: { tenantId: context.tenantId, userId: context.userId } } })
    ]);
    const isOwner = String(user?.role ?? "").toLowerCase() === "owner";
    if (settings.moduleStatus !== "active") return { allowed: false, isOwner, reason: "marketing_module_inactive" };
    return { allowed: isOwner || Boolean(grant?.enabled), isOwner, reason: "marketing_access_required" };
  }

  private async findInboundMarketingProfile(tenantId: string, channel: string, phone: string): Promise<{ channel: string; id: string; timeZone: string | null } | null> {
    const sourceProfileId = inboundMarketingProfileIdentity(tenantId, channel, phone);
    const exact = await prisma.clientProfile.findUnique({
      where: { tenantId_sourceProfileId: { tenantId, sourceProfileId } },
      select: { channel: true, id: true, timeZone: true }
    });
    if (exact) return exact;
    const candidates = await prisma.clientProfile.findMany({ where: { tenantId, phone: phone.trim() }, select: { channel: true, id: true, timeZone: true }, take: 10 });
    const channelMatches = candidates.filter((candidate: { channel: string }) => candidate.channel.toLowerCase() === channel.toLowerCase());
    if (channelMatches.length === 1) return channelMatches[0];
    return candidates.length === 1 ? candidates[0] : null;
  }

  private async ensureSettings(tenantId: string) {
    let settings = await prisma.marketingSettings.upsert({ where: { tenantId }, create: { tenantId, consentText: DEFAULT_MARKETING_CONSENT_TEXT }, update: {} });
    const currentConsentText = String(settings.consentText ?? "").trim();
    if (!currentConsentText) {
      settings = await prisma.marketingSettings.update({ where: { tenantId }, data: { consentText: DEFAULT_MARKETING_CONSENT_TEXT } });
    } else if (isLegacyMarketingConsentText(currentConsentText)) {
      settings = await prisma.marketingSettings.update({ where: { tenantId }, data: { consentText: DEFAULT_MARKETING_CONSENT_TEXT, consentVersion: { increment: 1 } } });
    }
    await prisma.marketingConsentTextVersion.upsert({ where: { tenantId_version: { tenantId, version: settings.consentVersion } }, create: { id: `mkt_consent_text_${randomUUID()}`, tenantId, version: settings.consentVersion, content: settings.consentText }, update: { content: settings.consentText } });
    return settings;
  }

  private async hasActiveChannels(tenantId: string, channels: string[]): Promise<boolean> {
    const active = await prisma.channelConnection.findMany({ where: { tenantId, status: "active" }, select: { type: true } });
    const activeTypes = new Set(active.map((connection: { type: string }) => String(connection.type).toLowerCase()));
    return channels.every((channel) => activeTypes.has(channel.toLowerCase()));
  }

  private async contentCapabilityError(tenantId: string, channels: string[], content: unknown): Promise<string | null> {
    const active = await prisma.channelConnection.findMany({ where: { tenantId, status: "active" }, select: { id: true, status: true, type: true } });
    const capabilityByType = new Map<string, ReturnType<typeof marketingChannelCapability>>(active.map((channel: { id: string; status: string; type: string }) => [channel.type.toLowerCase(), marketingChannelCapability(channel)] as const));
    const blockTypes = (isRecord(content) && Array.isArray(content.blocks) ? content.blocks : []).filter(isRecord).map((block) => text(block.type, 32));
    for (const channel of channels) {
      const capability = capabilityByType.get(channel.toLowerCase());
      if (!capability) continue;
      const unsupported = blockTypes.find((type) => !capability.supportedBlocks.includes(type));
      if (unsupported) return `Block '${unsupported}' is not supported by marketing channel '${channel}'.`;
      if (blockTypes.filter((type) => MARKETING_MEDIA_BLOCKS.has(type)).length > capability.maxAttachments) return `Marketing channel '${channel}' supports at most ${capability.maxAttachments} attachments per message.`;
    }
    return null;
  }

  private async hasSafeContentAttachments(content: unknown, tenantId: string): Promise<boolean> {
    const blocks = isRecord(content) && Array.isArray(content.blocks) ? content.blocks.filter(isRecord) : [];
    const mediaBlocks = blocks.filter((block) => MARKETING_MEDIA_BLOCKS.has(text(block.type, 32)));
    if (mediaBlocks.some((block) => !text(block.fileId ?? block.id, 256) || safeHttpsUrl(block.url))) return false;
    const fileIds = [...new Set(contentAttachments(content).flatMap((attachment) => typeof attachment.fileId === "string" ? [attachment.fileId] : []))];
    if (!fileIds.length) return mediaBlocks.length === 0;
    const files = await prisma.workspaceFile.findMany({ where: { tenantId, fileId: { in: fileIds } }, select: { fileId: true, scanState: true, scanVerdict: true, storageState: true } });
    return files.length === fileIds.length && files.every((file: { storageState: string; scanState: string; scanVerdict: string | null }) => file.storageState === "uploaded" && ["clean", "scan_clean"].includes(file.scanState) && file.scanVerdict === "clean");
  }

  private async findCampaign(id: string, tenantId: string) {
    return prisma.marketingCampaign.findFirst({ where: { id, tenantId } });
  }

  private async dispatchQueuedMarketingDeliveries(tenantId: string, limit = 500): Promise<number> {
    const deliveries = await prisma.marketingDelivery.findMany({
      where: { tenantId, outboundDescriptorId: null, status: "queued", OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }] },
      orderBy: { createdAt: "asc" },
      take: Math.max(1, Math.min(limit, 1_000)),
      select: { id: true, campaignId: true, channel: true, clientId: true, idempotencyKey: true }
    });
    if (!deliveries.length) return 0;
    const [campaigns, profiles] = await Promise.all([
      prisma.marketingCampaign.findMany({ where: { tenantId, id: { in: deliveries.map((delivery: { campaignId: string }) => delivery.campaignId) }, status: "sending" }, select: { content: true, id: true } }),
      prisma.clientProfile.findMany({ where: { tenantId, id: { in: deliveries.map((delivery: { clientId: string }) => delivery.clientId) } }, select: { id: true, name: true, phone: true } })
    ]);
    const campaignsById = new Map<string, { content: unknown; id: string }>(campaigns.map((campaign: { content: unknown; id: string }) => [campaign.id, campaign] as const));
    const profilesById = new Map<string, { id: string; name: string; phone: string }>(profiles.map((profile: { id: string; name: string; phone: string }) => [profile.id, profile] as const));
    let queued = 0;
    for (const delivery of deliveries) {
      const campaign = campaignsById.get(delivery.campaignId);
      const profile = profilesById.get(delivery.clientId);
      if (!campaign || !profile?.phone) {
        await prisma.marketingDelivery.updateMany({ where: { id: delivery.id, outboundDescriptorId: null, status: "queued" }, data: { status: "excluded", excludedReason: campaign ? "destination_missing" : "campaign_not_sending" } });
        continue;
      }
      const descriptorId = `mkt_outbound_${randomUUID()}`;
      const outbox = createOutboxEvent({ aggregateId: delivery.id, aggregateType: "marketing_delivery", payload: { channel: delivery.channel, descriptorId, marketingDeliveryId: delivery.id, maxAttempts: 3 }, queue: "message-delivery", traceId: createRequestTraceId(SERVICE, "dispatchQueuedMarketingDeliveries"), type: "conversation.outbound.requested" });
      const claimed = await prisma.$transaction(async (tx: any) => {
        const claim = await tx.marketingDelivery.updateMany({ where: { id: delivery.id, outboundDescriptorId: null, status: "queued" }, data: { outboundDescriptorId: descriptorId } });
        if (!claim.count) return false;
        await tx.conversationOutboundDescriptor.create({ data: { id: descriptorId, kind: "outbound_conversation", tenantId, conversationId: null, messageId: null, channel: delivery.channel, status: "queued", deliveryState: "queued", idempotencyKey: `marketing:${delivery.idempotencyKey}`, requestFingerprint: `marketing:${delivery.id}`, retryable: true, payload: { attachments: contentAttachments(campaign.content), channel: delivery.channel, clientName: profile.name ?? "", marketingCampaignId: campaign.id, marketingDeliveryId: delivery.id, message: contentToText(campaign.content) || "Вложение", phone: profile.phone, queue: "message-delivery", replyMarkup: contentReplyMarkup(campaign.content), topic: "marketing" }, auditId: null, traceId: outbox.traceId, outboxEventId: outbox.id } });
        await tx.outboxEvent.create({ data: { id: outbox.id, aggregateId: outbox.aggregateId, aggregateType: outbox.aggregateType, occurredAt: new Date(outbox.occurredAt), payload: outbox.payload, queue: outbox.queue, status: outbox.status, traceId: outbox.traceId, type: outbox.type } });
        return true;
      });
      if (claimed) queued += 1;
    }
    return queued;
  }

  private async releaseConsentBlockedDeliveries(tenantId: string, limit = 500): Promise<number> {
    const blocked = await prisma.marketingDelivery.findMany({
      where: { tenantId, excludedReason: "consent_required", status: "excluded" },
      orderBy: { createdAt: "asc" },
      take: Math.max(1, Math.min(limit, 1_000)),
      select: { campaignId: true, channel: true, clientId: true, id: true }
    });
    if (!blocked.length) return 0;
    const [settings, campaigns, profiles, consents, tenant] = await Promise.all([
      this.ensureSettings(tenantId),
      prisma.marketingCampaign.findMany({ where: { tenantId, id: { in: blocked.map((delivery: { campaignId: string }) => delivery.campaignId) }, status: { in: ["sending", "completed"] } }, select: { id: true, strategy: true } }),
      prisma.clientProfile.findMany({ where: { tenantId, id: { in: blocked.map((delivery: { clientId: string }) => delivery.clientId) } }, select: { id: true, phone: true, timeZone: true } }),
      prisma.marketingConsent.findMany({ where: { tenantId, OR: blocked.map((delivery: { clientId: string; channel: string }) => ({ clientId: delivery.clientId, channel: delivery.channel })) }, select: { channel: true, clientId: true, status: true } }),
      prisma.tenant.findUnique({ where: { id: tenantId }, select: { metadata: true } })
    ]);
    if (!marketingConsentPolicy(settings).allowWithoutConsent) return 0;
    const campaignStrategyById = new Map<string, string>(campaigns.map((campaign: { id: string; strategy: string }) => [campaign.id, campaign.strategy]));
    const profilesById = new Map<string, { id: string; phone: string; timeZone: string | null }>(profiles.map((profile: { id: string; phone: string; timeZone: string | null }) => [profile.id, profile]));
    const consentStatusByKey = new Map<string, string>(consents.map((consent: { channel: string; clientId: string; status: string }) => [`${consent.clientId}:${consent.channel}`, consent.status]));
    const fallbackTimeZone = tenantTimeZone(tenant?.metadata);
    const now = new Date();
    const releasable: Array<{ campaignId: string; channel: string; clientId: string; id: string; scheduledAt: Date | null; status: "queued" | "waiting" }> = [];
    const terminalExclusions: Array<{ id: string; reason: string }> = [];
    const claimedCascadeClients = new Set<string>();
    for (const delivery of blocked as Array<{ campaignId: string; channel: string; clientId: string; id: string }>) {
      const profile = profilesById.get(delivery.clientId);
      const strategy = campaignStrategyById.get(delivery.campaignId);
      const consentStatus = consentStatusByKey.get(`${delivery.clientId}:${delivery.channel}`);
      if (!strategy) { terminalExclusions.push({ id: delivery.id, reason: "campaign_not_sending" }); continue; }
      if (!profile?.phone) { terminalExclusions.push({ id: delivery.id, reason: "destination_missing" }); continue; }
      if (!marketingConsentAllowsDelivery(consentStatus, true)) { terminalExclusions.push({ id: delivery.id, reason: "consent_withdrawn" }); continue; }
      const cascadeKey = `${delivery.campaignId}:${delivery.clientId}`;
      const status = strategy === "cascade" && claimedCascadeClients.has(cascadeKey) ? "waiting" : "queued";
      if (strategy === "cascade") claimedCascadeClients.add(cascadeKey);
      releasable.push({ ...delivery, scheduledAt: status === "queued" ? quietHoursEnd(now, settings.quietHoursStart, settings.quietHoursEnd, tenantTimeZone({ timeZone: profile.timeZone || fallbackTimeZone })) : null, status });
    }
    if (!releasable.length && !terminalExclusions.length) return 0;
    await prisma.$transaction(async (tx: any) => {
      for (const delivery of terminalExclusions) {
        await tx.marketingDelivery.updateMany({ where: { id: delivery.id, excludedReason: "consent_required", status: "excluded" }, data: { excludedReason: delivery.reason } });
      }
      for (const delivery of releasable) {
        await tx.marketingDelivery.updateMany({ where: { id: delivery.id, excludedReason: "consent_required", status: "excluded" }, data: { excludedReason: null, scheduledAt: delivery.scheduledAt, status: delivery.status } });
      }
      if (releasable.length) await tx.marketingCampaign.updateMany({ where: { tenantId, id: { in: [...new Set(releasable.map((delivery) => delivery.campaignId))] } }, data: { status: "sending" } });
      await this.createUsageCharges(tx, tenantId, releasable.filter((delivery) => delivery.status === "queued"), settings, now);
      await tx.marketingAuditEvent.create({ data: { id: `mkt_audit_${randomUUID()}`, tenantId, actorUserId: null, action: "marketing.consent_policy.blocked_deliveries_released", entityType: "settings", entityId: tenantId, details: { released: releasable.length, terminalExclusions: terminalExclusions.length, rule: "allow_without_consent" } } });
    });
    if (releasable.length) await this.dispatchQueuedMarketingDeliveries(tenantId);
    return releasable.length;
  }

  private async requestMissingMarketingConsents(tenantId: string, limit = 500): Promise<number> {
    const settings = await this.ensureSettings(tenantId);
    const consentPolicy = marketingConsentPolicy(settings);
    if (consentPolicy.allowWithoutConsent) { await this.releaseConsentBlockedDeliveries(tenantId, limit); return 0; }
    if (!consentPolicy.requestConsentEnabled) return 0;
    const deliveries = await prisma.marketingDelivery.findMany({
      where: { tenantId, excludedReason: "consent_required", status: "excluded" },
      orderBy: { createdAt: "asc" },
      take: Math.max(1, Math.min(limit, 1_000)),
      select: { campaignId: true, channel: true, clientId: true, id: true }
    });
    if (!deliveries.length) return 0;
    const [campaigns, profiles, consents] = await Promise.all([
      prisma.marketingCampaign.findMany({ where: { tenantId, id: { in: deliveries.map((delivery: { campaignId: string }) => delivery.campaignId) } }, select: { createdBy: true, id: true } }),
      prisma.clientProfile.findMany({ where: { tenantId, id: { in: deliveries.map((delivery: { clientId: string }) => delivery.clientId) } }, select: { id: true, name: true, phone: true } }),
      prisma.marketingConsent.findMany({ where: { tenantId, OR: deliveries.map((delivery: { clientId: string; channel: string }) => ({ clientId: delivery.clientId, channel: delivery.channel })) }, select: { channel: true, clientId: true } })
    ]);
    const campaignById = new Map<string, { createdBy: string; id: string }>(campaigns.map((campaign: { createdBy: string; id: string }) => [campaign.id, campaign] as const));
    const profileById = new Map<string, { id: string; name: string; phone: string }>(profiles.map((profile: { id: string; name: string; phone: string }) => [profile.id, profile] as const));
    const consentKeys = new Set(consents.map((consent: { channel: string; clientId: string }) => `${consent.clientId}:${consent.channel}`));
    let requested = 0;
    for (const delivery of deliveries) {
      const campaign = campaignById.get(delivery.campaignId);
      const profile = profileById.get(delivery.clientId);
      if (!campaign || !profile?.phone || consentKeys.has(`${delivery.clientId}:${delivery.channel}`)) continue;
      const consentId = `mkt_consent_${randomUUID()}`;
      const descriptorId = `mkt_consent_outbound_${randomUUID()}`;
      const outbox = createOutboxEvent({ aggregateId: consentId, aggregateType: "marketing_consent", payload: { channel: delivery.channel, descriptorId, maxAttempts: 3 }, queue: "message-delivery", traceId: createRequestTraceId(SERVICE, "requestMissingMarketingConsents"), type: "conversation.outbound.requested" });
      const created = await prisma.$transaction(async (tx: any) => {
        const existing = await tx.marketingConsent.findUnique({ where: { tenantId_clientId_channel: { tenantId, clientId: delivery.clientId, channel: delivery.channel } }, select: { id: true } });
        if (existing) return false;
        await tx.marketingConsent.create({ data: { id: consentId, tenantId, clientId: delivery.clientId, channel: delivery.channel, status: "pending", source: "system", consentVersion: settings.consentVersion, evidence: { campaignId: campaign.id, requestedBy: campaign.createdBy }, recordedAt: new Date() } });
        await tx.conversationOutboundDescriptor.create({ data: { id: descriptorId, kind: "outbound_conversation", tenantId, conversationId: null, messageId: null, channel: delivery.channel, status: "queued", deliveryState: "queued", idempotencyKey: `marketing-consent:${consentId}`, requestFingerprint: `marketing-consent:${delivery.clientId}:${delivery.channel}`, retryable: true, payload: { channel: delivery.channel, clientName: profile.name ?? "", marketingConsentId: consentId, message: settings.consentText || DEFAULT_MARKETING_CONSENT_TEXT, phone: profile.phone, queue: "message-delivery", topic: "marketing-consent" }, auditId: null, traceId: outbox.traceId, outboxEventId: outbox.id } });
        await tx.outboxEvent.create({ data: { id: outbox.id, aggregateId: outbox.aggregateId, aggregateType: outbox.aggregateType, occurredAt: new Date(outbox.occurredAt), payload: outbox.payload, queue: outbox.queue, status: outbox.status, traceId: outbox.traceId, type: outbox.type } });
        return true;
      });
      if (created) requested += 1;
    }
    return requested;
  }

  private async reconcileOutboundDeliveryStates(tenantId: string): Promise<void> {
    const pending = await prisma.marketingDelivery.findMany({ where: { tenantId, status: { in: ["queued", "failed"] }, outboundDescriptorId: { not: null } }, select: { id: true, outboundDescriptorId: true } });
    const descriptors = pending.length ? await prisma.conversationOutboundDescriptor.findMany({ where: { id: { in: pending.map((item: { outboundDescriptorId: string }) => item.outboundDescriptorId) } }, select: { id: true, deliveryState: true, outboxEventId: true } }) : [];
    const outboxIds = descriptors.map((descriptor: { outboxEventId: string | null }) => descriptor.outboxEventId).filter(Boolean);
    const outboxEvents = outboxIds.length ? await prisma.outboxEvent.findMany({ where: { id: { in: outboxIds } }, select: { id: true, status: true } }) : [];
    const stateByDescriptor = new Map<string, { deliveryState: string | null; outboxStatus?: string }>(descriptors.map((descriptor: { id: string; deliveryState: string | null; outboxEventId: string | null }) => [descriptor.id, { deliveryState: descriptor.deliveryState, outboxStatus: outboxEvents.find((event: { id: string }) => event.id === descriptor.outboxEventId)?.status }]));
    await Promise.all(pending.map((delivery: { id: string; outboundDescriptorId: string }) => {
      const state = stateByDescriptor.get(delivery.outboundDescriptorId);
      return state?.deliveryState === "delivered" ? prisma.marketingDelivery.update({ where: { id: delivery.id }, data: { status: "delivered" } })
        : state?.deliveryState === "sent" ? prisma.marketingDelivery.update({ where: { id: delivery.id }, data: { status: "sent" } })
        : state?.deliveryState === "failed" && state.outboxStatus === "dead_lettered" ? prisma.marketingDelivery.update({ where: { id: delivery.id }, data: { status: "failed" } })
          : Promise.resolve();
    }));
    await this.advanceCascadeDeliveries(tenantId);
    const sendingCampaigns = await prisma.marketingCampaign.findMany({ where: { tenantId, status: "sending" }, select: { id: true } });
    await Promise.all(sendingCampaigns.map(async (campaign: { id: string }) => {
      const active = await prisma.marketingDelivery.count({ where: { tenantId, campaignId: campaign.id, status: { in: ["queued", "waiting"] } } });
      if (active > 0) return;
      const consentBlocked = await prisma.marketingDelivery.findMany({ where: { tenantId, campaignId: campaign.id, status: "excluded", excludedReason: "consent_required" }, select: { channel: true, clientId: true } });
      const pendingConsent = consentBlocked.length ? await prisma.marketingConsent.count({ where: { tenantId, status: "pending", OR: consentBlocked.map((delivery: { channel: string; clientId: string }) => ({ channel: delivery.channel, clientId: delivery.clientId })) } }) : 0;
      if (pendingConsent === 0) await prisma.marketingCampaign.update({ where: { id: campaign.id }, data: { status: "completed" } });
    }));
  }

  private async advanceCascadeDeliveries(tenantId: string): Promise<void> {
    const billingSettings = await this.ensureSettings(tenantId);
    const campaigns = await prisma.marketingCampaign.findMany({ where: { tenantId, status: "sending", strategy: "cascade" }, select: { id: true, content: true } });
    for (const campaign of campaigns) {
      const deliveries = await prisma.marketingDelivery.findMany({ where: { tenantId, campaignId: campaign.id, status: { in: ["queued", "waiting", "failed", "sent", "delivered"] } }, orderBy: { createdAt: "asc" } });
      const byClient = new Map<string, any[]>();
      for (const delivery of deliveries) byClient.set(delivery.clientId, [...(byClient.get(delivery.clientId) ?? []), delivery]);
      for (const clientDeliveries of byClient.values()) {
        if (clientDeliveries.some((delivery) => ["sent", "delivered"].includes(delivery.status))) {
          await prisma.marketingDelivery.updateMany({ where: { id: { in: clientDeliveries.filter((delivery) => delivery.status === "waiting").map((delivery) => delivery.id) } }, data: { status: "cancelled", excludedReason: "cascade_delivered" } });
          continue;
        }
        if (clientDeliveries.some((delivery) => delivery.status === "queued") || !clientDeliveries.some((delivery) => delivery.status === "failed")) continue;
        const next = clientDeliveries.find((delivery) => delivery.status === "waiting");
        if (!next) continue;
        const profile = await prisma.clientProfile.findFirst({ where: { tenantId, id: next.clientId }, select: { name: true, phone: true } });
        if (!profile?.phone) { await prisma.marketingDelivery.update({ where: { id: next.id }, data: { status: "excluded", excludedReason: "destination_missing" } }); continue; }
        const descriptorId = `mkt_outbound_${randomUUID()}`;
        const outbox = createOutboxEvent({ aggregateId: next.id, aggregateType: "marketing_delivery", payload: { channel: next.channel, descriptorId, marketingDeliveryId: next.id, maxAttempts: 3 }, queue: "message-delivery", traceId: createRequestTraceId(SERVICE, "advanceCascadeDeliveries"), type: "conversation.outbound.requested" });
        await prisma.$transaction(async (tx: any) => {
          await tx.marketingDelivery.update({ where: { id: next.id }, data: { status: "queued", outboundDescriptorId: descriptorId } });
          await tx.conversationOutboundDescriptor.create({ data: { id: descriptorId, kind: "outbound_conversation", tenantId, conversationId: null, messageId: null, channel: next.channel, status: "queued", deliveryState: "queued", idempotencyKey: `marketing:${next.idempotencyKey}`, requestFingerprint: `marketing:${next.id}`, retryable: true, payload: { attachments: contentAttachments(campaign.content), channel: next.channel, clientName: profile.name, marketingCampaignId: campaign.id, marketingDeliveryId: next.id, message: contentToText(campaign.content) || "Вложение", phone: profile.phone, queue: "message-delivery", replyMarkup: contentReplyMarkup(campaign.content), topic: "marketing" }, auditId: null, traceId: outbox.traceId, outboxEventId: outbox.id } });
          await tx.outboxEvent.create({ data: { id: outbox.id, aggregateId: outbox.aggregateId, aggregateType: outbox.aggregateType, occurredAt: new Date(outbox.occurredAt), payload: outbox.payload, queue: outbox.queue, status: outbox.status, traceId: outbox.traceId, type: outbox.type } });
          await this.createUsageCharges(tx, tenantId, [next], billingSettings, new Date());
        });
      }
    }
  }

  private async createUsageCharges(tx: any, tenantId: string, deliveries: Array<{ campaignId: string; clientId: string; channel: string }>, settings: { includedMessages: number; overageKopeks: number }, now: Date): Promise<void> {
    if (!deliveries.length) return;
    const periodStart = marketingPeriodStart(now);
    const existing = await tx.marketingUsageCharge.count({ where: { tenantId, periodStart } });
    await tx.marketingUsageCharge.createMany({ data: deliveries.map((delivery, index) => ({
      id: `mkt_charge_${randomUUID()}`,
      tenantId,
      campaignId: delivery.campaignId,
      clientId: delivery.clientId,
      channel: delivery.channel,
      periodStart,
      included: existing + index < settings.includedMessages,
      amountKopeks: existing + index < settings.includedMessages ? 0 : settings.overageKopeks
    })), skipDuplicates: true });
  }

  private async resolveImportedClients(records: Array<Record<string, unknown>>, tenantId: string, rawOverrides?: unknown): Promise<string[]> {
    const matches = await this.resolveImportedClientMatches(records, tenantId);
    const automatic = matches.filter((item) => item.candidates.length === 1).map((item) => item.candidates[0].id);
    const requestedOverrides = isRecord(rawOverrides) ? Object.entries(rawOverrides).map(([index, clientId]) => ({ index: Number(index), clientId: text(clientId, 128) })) : [];
    const allowedIndexes = new Set(matches.filter((item) => item.candidates.length !== 1).map((item) => item.index));
    const overrideIds = requestedOverrides.filter((item) => allowedIndexes.has(item.index) && item.clientId).map((item) => item.clientId);
    if (!overrideIds.length) return [...new Set(automatic)];
    const existing = await prisma.clientProfile.findMany({ where: { tenantId, id: { in: overrideIds } }, select: { id: true } });
    return [...new Set([...automatic, ...existing.map((client: { id: string }) => client.id)])];
  }

  private async resolveImportedClientMatches(records: Array<Record<string, unknown>>, tenantId: string): Promise<Array<{ index: number; candidates: Array<{ id: string; name: string; phone: string }> }>> {
    if (!records.length) return [];
    const clientIds = uniqueStrings(records.map((record) => record.clientId ?? record.id));
    const sourceProfileIds = uniqueStrings(records.map((record) => record.externalId ?? record.sourceProfileId));
    const phones = uniqueStrings(records.map((record) => record.phone));
    const normalizedPhones = [...new Set(records.map((record) => normalizePhone(record.phone)).filter(Boolean))];
    const emails = [...new Set(records.map((record) => normalizeEmail(record.email)).filter(Boolean))];
    const matches = await prisma.clientProfile.findMany({ where: { tenantId, OR: [
      ...(clientIds.length ? [{ id: { in: clientIds } }] : []),
      ...(sourceProfileIds.length ? [{ sourceProfileId: { in: sourceProfileIds } }] : []),
      ...(phones.length ? [{ phone: { in: phones } }] : []),
      ...(normalizedPhones.length ? [{ phoneNormalized: { in: normalizedPhones } }] : []),
      ...(emails.length ? [{ email: { in: emails } }] : [])
    ] }, select: { email: true, id: true, name: true, phone: true, phoneNormalized: true, sourceProfileId: true } });
    const byValue = new Map<string, Array<{ id: string; name: string; phone: string }>>();
    for (const match of matches) for (const value of [match.id, match.phone, normalizePhone(match.phoneNormalized ?? match.phone), match.sourceProfileId, normalizeEmail(match.email)]) {
      const key = text(value, 128); if (key) byValue.set(key, [...(byValue.get(key) ?? []), match]);
    }
    return records.map((record, index) => {
      const values = [record.clientId, record.id, record.externalId, record.sourceProfileId, record.phone, normalizePhone(record.phone), normalizeEmail(record.email)].map((value) => text(value, 128)).filter(Boolean);
      const candidates = [...new Map(values.flatMap((value) => byValue.get(value) ?? []).map((candidate) => [candidate.id, candidate])).values()];
      return { index, candidates };
    });
  }
}

export class MarketingAccessError extends Error {}
function envelope(operation: string, data: Record<string, unknown>) { return createEnvelope({ service: SERVICE, operation, traceId: createRequestTraceId(SERVICE, operation), data }); }
function invalidEnvelope(operation: string, code: string, message: string) { return createEnvelope({ service: SERVICE, operation, traceId: createRequestTraceId(SERVICE, operation), status: "invalid", data: {}, error: { code, message } }); }
function deniedEnvelope(operation: string, code: string) { return createEnvelope({ service: SERVICE, operation, traceId: createRequestTraceId(SERVICE, operation), status: "invalid", data: {}, error: { code, message: "Marketing module access is required." } }); }
function notFoundEnvelope(operation: string, code: string, message: string) { return createEnvelope({ service: SERVICE, operation, traceId: createRequestTraceId(SERVICE, operation), status: "not_found", data: {}, error: { code, message } }); }
function text(value: unknown, max: number) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
export function inboundMarketingProfileIdentity(tenantId: string, channel: string, phone: string): string {
  const digest = createHash("sha256").update(`${tenantId.trim()}:${channel.trim().toLowerCase()}:${phone.trim()}`).digest("hex").slice(0, 32);
  return `inbound_${channel.trim().toLowerCase()}_${digest}`;
}
export function inboundMarketingDeliveryAddress(phone: string, providerConversationId?: string): string {
  return text(providerConversationId, 256) || text(phone, 256);
}
export function normalizeConsentReply(value: unknown): "grant" | null {
  return text(value, 200) ? "grant" : null;
}
function optionalText(value: unknown, max: number) { const valueText = text(value, max); return valueText || null; }
export function marketingDestinationKey(phone: unknown, channel: unknown) { return `${text(phone, 256)}:${text(channel, 64).toLowerCase()}`; }
function uniqueStrings(value: unknown) { return Array.isArray(value) ? [...new Set(value.map((item) => text(item, 64)).filter(Boolean))] : []; }
const MARKETING_MEDIA_BLOCKS = new Set(["image", "file", "gif", "audio", "video"]);
const MARKETING_BASE_BLOCKS = ["text", "heading", "button", "divider", "spacer"];
const MARKETING_RICH_BLOCKS = [...MARKETING_BASE_BLOCKS, "image", "file", "gif", "audio", "video"];
function marketingChannelCapability(channel: { id: string; status: string; type: string }) {
  const type = String(channel.type).toLowerCase();
  const rich = ["email", "telegram", "vk", "max"].some((known) => type.includes(known));
  const blocks = rich ? MARKETING_RICH_BLOCKS : MARKETING_BASE_BLOCKS;
  return {
    channel: channel.type,
    connectionId: channel.id,
    status: channel.status,
    supportedBlocks: blocks,
    maxAttachments: rich ? 10 : 0,
    maxMessageCharacters: 4_000,
    fallback: "none"
  };
}
export function normalizePhone(value: unknown) { const digits = text(value, 64).replace(/\D/g, ""); return digits.length === 11 && digits.startsWith("8") ? `7${digits.slice(1)}` : digits; }
export function marketingTestRecipientSearchTerms(value: unknown) {
  const query = text(value, 128);
  return { phone: normalizePhone(query), query };
}
export function maskMarketingTestRecipientPhone(value: unknown) {
  const digits = normalizePhone(value);
  return digits.length >= 4 ? `••• ${digits.slice(-4)}` : "";
}
export function maskMarketingTestRecipientEmail(value: unknown) {
  const email = text(value, 320).toLocaleLowerCase();
  const separator = email.lastIndexOf("@");
  if (separator <= 0 || separator === email.length - 1) return "";
  return `${email[0]}***${email.slice(separator)}`;
}
function normalizeEmail(value: unknown) { const candidate = text(value, 320).toLocaleLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : ""; }
function boundedPositiveInt(value: unknown, fallback: number, maximum: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}
function hour(value: unknown) { const number = Number(value); return Number.isInteger(number) && number >= 0 && number <= 23 ? number : null; }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }
function normalizeContent(value: unknown) {
  const candidate = isRecord(value) && Array.isArray(value.blocks) ? value.blocks : [];
  const allowed = new Set(["text", "heading", "image", "file", "gif", "audio", "video", "button", "divider", "spacer"]);
  return { blocks: candidate.slice(0, 100).filter(isRecord).map((block) => {
    const type = text(block.type, 32); if (!allowed.has(type)) return null;
    return { ...block, type, html: undefined };
  }).filter(Boolean) };
}
function contentToText(content: unknown): string {
  const blocks = isRecord(content) && Array.isArray(content.blocks) ? content.blocks : [];
  return blocks.filter(isRecord).map((block) => text(block.text ?? block.title ?? block.alt, 4_000)).filter(Boolean).join("\n").trim().slice(0, 4_000);
}
function contentAttachments(content: unknown): Array<Record<string, unknown>> {
  const blocks = isRecord(content) && Array.isArray(content.blocks) ? content.blocks : [];
  return blocks.filter(isRecord).filter((block) => ["image", "file", "gif", "audio", "video"].includes(text(block.type, 32))).map((block) => {
    const fileId = text(block.fileId ?? block.id, 256);
    const fileName = text(block.fileName ?? block.name ?? block.title, 512);
    const mimeType = text(block.mimeType ?? block.contentType, 128);
    return { ...(fileId ? { fileId } : {}), ...(fileName ? { fileName } : {}), ...(mimeType ? { mimeType } : {}), type: text(block.type, 32) };
  }).filter((attachment) => Boolean(attachment.fileId));
}
function contentReplyMarkup(content: unknown): Record<string, unknown> | undefined {
  const blocks = isRecord(content) && Array.isArray(content.blocks) ? content.blocks : [];
  const buttons = blocks.filter(isRecord).filter((block) => text(block.type, 32) === "button").map((block) => ({ text: text(block.label ?? block.text, 64), url: safeHttpsUrl(block.url) })).filter((button) => button.text && button.url).slice(0, 8);
  return buttons.length ? { inline_keyboard: buttons.map((button) => [button]) } : undefined;
}
function parseFutureDate(value: unknown) { if (!value) return null; const date = new Date(String(value)); return Number.isFinite(date.getTime()) && date.getTime() > Date.now() ? date : null; }
function safeHttpsUrl(value: unknown) { const candidate = text(value, 2_000); try { return new URL(candidate).protocol === "https:" ? candidate : ""; } catch { return ""; } }
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value === undefined ? null : value);
}
function marketingPeriodStart(value: Date) { return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1)); }
function tenantTimeZone(metadata: unknown): string {
  const requested = isRecord(metadata) ? text(metadata.timeZone ?? metadata.timezone, 64) : "";
  try { new Intl.DateTimeFormat("en-US", { timeZone: requested || "Europe/Moscow" }).format(); return requested || "Europe/Moscow"; }
  catch { return "Europe/Moscow"; }
}
export function quietHoursEnd(now: Date, start: number, end: number, timeZone: string): Date | null {
  if (start === end) return null;
  const inQuietHours = (hour: number) => start < end ? hour >= start && hour < end : hour >= start || hour < end;
  const localTime = (value: Date) => Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(value).map((part) => [part.type, part.value]));
  const localHour = (value: Date) => Number(localTime(value).hour);
  if (!inQuietHours(localHour(now))) return null;
  const candidate = new Date(now.getTime());
  candidate.setUTCSeconds(0, 0);
  for (let minute = 0; minute <= 24 * 60; minute += 1) {
    if (localHour(candidate) === end && localTime(candidate).minute === "00") return candidate;
    candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
  }
  return null;
}
function serialize(value: any): any { return JSON.parse(JSON.stringify(value, (_key, item) => item instanceof Date ? item.toISOString() : item)); }
function summarizeDeliveries(rows: any[], campaignId: string) { return rows.filter((row) => row.campaignId === campaignId).reduce((summary, row) => ({ ...summary, [row.status]: row._count._all }), {}); }
export function hashMarketingApiKey(value: string) { return createHash("sha256").update(value).digest("hex"); }
function safeHashEqual(left: string, right: string) { return left.length === right.length && timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex")); }
