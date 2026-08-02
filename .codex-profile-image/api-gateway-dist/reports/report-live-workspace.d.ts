import type { ConversationMessage, ConversationRecord } from "../conversation/conversation.types.js";
export type LiveReportPeriod = "today" | "yesterday" | "7days" | "30days";
export type LiveReportTone = "danger" | "ok" | "warn";
export type LiveReportMessage = ConversationMessage;
export interface LiveReportLifecycleEvent {
    data?: Record<string, unknown>;
    eventType: string;
    occurredAt: string;
}
export interface LiveReportConversation extends Pick<ConversationRecord, "channel" | "messages" | "slaTone" | "status" | "updatedAt"> {
    closedAt?: string;
    createdAt?: string;
    lifecycleEvents?: LiveReportLifecycleEvent[];
}
export interface LiveReportWorkspaceOptions {
    channel?: string;
    now?: Date | number | string;
    period?: LiveReportPeriod | "7_days" | "30_days" | "Сегодня" | "Вчера" | "7 дней" | "30 дней";
    timezoneOffsetMinutes?: number;
}
export interface LiveReportWorkspaceInput extends LiveReportWorkspaceOptions {
    conversations: readonly LiveReportConversation[];
}
export interface LiveReportMetrics {
    closedConversations: number;
    firstResponseSeconds: number;
    firstResponseSamples: number;
    newConversations: number;
    slaPercent: number;
    slaSamples: number;
    slaViolations: number;
}
export interface LiveReportWindow {
    from: string;
    to: string;
}
export interface LiveReportMetricRow {
    current: string;
    delta: string;
    key: "closedConversations" | "firstResponseSeconds" | "newConversations" | "slaPercent";
    metric: string;
    previous: string;
    status: string;
    tone: LiveReportTone;
}
export type LiveReportChannelBar = [channel: string, percent: number];
export interface LiveReportChartSeries {
    name: string;
    points: number[];
}
export interface LiveReportChartBlock {
    delta: string;
    id: "first-response" | "new-closed" | "sla";
    labels: string[];
    legend: string[];
    points: number[];
    series: LiveReportChartSeries[];
    title: string;
    tone: LiveReportTone;
    value: string;
}
export interface LiveReportWorkspace {
    bars: LiveReportChannelBar[];
    channel: string;
    chartBlocks: LiveReportChartBlock[];
    current: LiveReportMetrics;
    period: LiveReportPeriod;
    periodLabel: string;
    previous: LiveReportMetrics;
    rows: LiveReportMetricRow[];
    windows: {
        current: LiveReportWindow;
        previous: LiveReportWindow;
    };
}
export declare function buildLiveReportWorkspace(conversations: readonly LiveReportConversation[], options?: LiveReportWorkspaceOptions): LiveReportWorkspace;
export declare function buildLiveReportWorkspace(input: LiveReportWorkspaceInput): LiveReportWorkspace;
