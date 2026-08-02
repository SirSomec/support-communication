export type ProactiveExposureStatus = "planned" | "delivered" | "shown" | "dismissed" | "accepted" | "failed";
export declare const DEFAULT_PROACTIVE_ATTRIBUTION_WINDOW_MS: number;
export interface ProactiveExposure {
    acceptedAt: string | null;
    attributionWindowEndsAt: string | null;
    channelConnectionId: string;
    conversationId: string | null;
    dismissedAt: string | null;
    deliveredAt: string | null;
    experimentId: string;
    experimentVersion: string;
    exposureId: string;
    failedAt: string | null;
    failureCode: string | null;
    message: string;
    occurrenceKey: string;
    plannedAt: string;
    presenceSessionId: string;
    ruleId: string;
    segmentSnapshot: Record<string, unknown>;
    shownAt: string | null;
    status: ProactiveExposureStatus;
    subjectId: string;
    tenantId: string;
    variant: string;
}
export interface ProactiveConversionEvent {
    conversationId: string;
    conversionId: string;
    experimentId: string;
    experimentVersion: string;
    exposureId: string;
    messageId: string | null;
    occurredAt: string;
    ruleId: string;
    tenantId: string;
    trigger: "message";
    variant: string;
}
export interface ProactiveMetricBucket {
    counts: {
        accepted: number;
        converted: number;
        delivered: number;
        dismissed: number;
        eligible: number;
        planned: number;
        shown: number;
    };
    rates: {
        acceptanceRate: number;
        conversionRate: number;
        deliveryRate: number;
        showRate: number;
    };
    ruleId: string;
    variant: string;
}
interface PrismaExposureDelegate {
    create(input: {
        data: Record<string, unknown>;
    }): Promise<Record<string, unknown>>;
    findMany(input: Record<string, unknown>): Promise<Array<Record<string, unknown>>>;
    findUnique(input: {
        where: Record<string, unknown>;
    }): Promise<Record<string, unknown> | null>;
    updateMany(input: {
        data: Record<string, unknown>;
        where: Record<string, unknown>;
    }): Promise<{
        count: number;
    }>;
}
interface PrismaConversionDelegate {
    create(input: {
        data: Record<string, unknown>;
    }): Promise<Record<string, unknown>>;
    findMany(input: Record<string, unknown>): Promise<Array<Record<string, unknown>>>;
    findUnique(input: {
        where: Record<string, unknown>;
    }): Promise<Record<string, unknown> | null>;
}
export interface PrismaExposureClient {
    proactiveConversionEvent?: PrismaConversionDelegate;
    proactiveExposure: PrismaExposureDelegate;
}
export declare class ProactiveExposureRepository {
    private readonly store;
    private readonly prisma?;
    private constructor();
    static default(): ProactiveExposureRepository;
    static useDefault(repository: ProactiveExposureRepository): void;
    static clearDefault(): void;
    static inMemory(seed?: ProactiveExposure[]): ProactiveExposureRepository;
    static prisma(client: PrismaExposureClient): ProactiveExposureRepository;
    createPlanned(input: Omit<ProactiveExposure, "exposureId" | "status" | "acceptedAt" | "attributionWindowEndsAt" | "conversationId" | "deliveredAt" | "dismissedAt" | "failedAt" | "failureCode" | "shownAt">): Promise<{
        created: boolean;
        exposure: ProactiveExposure;
    }>;
    listPendingForSession(tenantId: string, presenceSessionId: string, limit?: number): Promise<ProactiveExposure[]>;
    markDelivered(input: {
        at: string;
        exposureId: string;
        presenceSessionId: string;
        tenantId: string;
    }): Promise<ProactiveExposure | null>;
    listRecent(tenantId: string, ruleId: string, subjectId: string, since: string): Promise<ProactiveExposure[]>;
    transition(input: {
        at: string;
        attributionWindowMs?: number;
        conversationId?: string;
        exposureId: string;
        failureCode?: string;
        presenceSessionId: string;
        status: Exclude<ProactiveExposureStatus, "planned">;
        tenantId: string;
    }): Promise<ProactiveExposure | null>;
    recordMessageConversion(input: {
        conversationId: string;
        messageId?: string | null;
        occurredAt: string;
        tenantId: string;
    }): Promise<ProactiveConversionEvent | null>;
    aggregateMetrics(input: {
        from: string;
        ruleVariants: Array<{
            ruleId: string;
            variant: string;
        }>;
        tenantId: string;
        to: string;
    }): Promise<ProactiveMetricBucket[]>;
    private findAttributableExposures;
    private listInRange;
    private listConversionsInRange;
}
export {};
