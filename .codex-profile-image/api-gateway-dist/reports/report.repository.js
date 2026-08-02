import { randomUUID } from "node:crypto";
import { InMemoryStore } from "@support-communication/database";
import { REPORT_COLUMN_OPTIONS, REPORT_METRIC_DEFINITION_VERSION } from "./report-definition.js";
let defaultRepository = null;
export class ReportRepository {
    store;
    prismaClient;
    constructor(store, prismaClient) {
        this.store = store;
        this.prismaClient = prismaClient;
    }
    static default() {
        if (defaultRepository) {
            return defaultRepository;
        }
        return ReportRepository.inMemory();
    }
    static useDefault(repository) {
        defaultRepository = repository;
    }
    static clearDefault() {
        defaultRepository = null;
    }
    static inMemory(seed) {
        return new ReportRepository(new InMemoryStore(seed ?? createEmptyReportState()));
    }
    static prisma({ client }) {
        assertCompletePrismaReportClient(client);
        return new ReportRepository(new InMemoryStore(createEmptyReportState()), client);
    }
    readState() {
        return normalizeState(this.store.read());
    }
    readWorkspaceCatalog() {
        return clone(this.readState().workspace);
    }
    async listConversationReportSourceRowsAsync(input) {
        if (this.prismaClient?.conversationLifecycleEvent) {
            const events = await this.prismaClient.conversationLifecycleEvent.findMany({
                orderBy: { occurredAt: "asc" },
                select: {
                    conversation: { select: { channel: true, operatorId: true, operatorName: true, queueId: true, status: true, teamId: true, topic: true } },
                    conversationId: true,
                    data: true,
                    eventType: true,
                    id: true,
                    ingestedAt: true,
                    occurredAt: true,
                    source: true
                },
                where: {
                    occurredAt: { gte: input.from, lt: input.to },
                    tenantId: input.tenantId
                }
            });
            const grouped = new Map();
            for (const event of events) {
                const current = grouped.get(event.conversationId) ?? {
                    channel: event.conversation.channel,
                    createdAt: "",
                    id: event.conversationId,
                    lifecycleEvents: [],
                    messages: [],
                    ...(event.conversation.operatorId ? { operatorId: event.conversation.operatorId } : {}),
                    ...(event.conversation.operatorName ? { operatorName: event.conversation.operatorName } : {}),
                    ...(event.conversation.queueId ? { queueId: event.conversation.queueId } : {}),
                    slaTone: "",
                    status: event.conversation.status,
                    ...(event.conversation.teamId ? { teamId: event.conversation.teamId } : {}),
                    topic: event.conversation.topic,
                    updatedAt: ""
                };
                current.lifecycleEvents.push({
                    ...(isRecord(event.data) ? { data: event.data } : {}),
                    eventType: event.eventType,
                    id: event.id,
                    ingestedAt: event.ingestedAt.toISOString(),
                    occurredAt: event.occurredAt.toISOString(),
                    source: event.source
                });
                grouped.set(event.conversationId, current);
            }
            return [...grouped.values()];
        }
        if (!this.prismaClient?.conversation) {
            return [];
        }
        const rows = await this.prismaClient.conversation.findMany({
            include: { messages: { orderBy: { createdAt: "asc" } } },
            orderBy: { createdAt: "asc" },
            where: {
                createdAt: { gte: input.from, lt: input.to },
                tenantId: input.tenantId
            }
        });
        return rows.map((row) => ({
            channel: row.channel,
            createdAt: row.createdAt.toISOString(),
            id: row.id,
            messages: row.messages.map((message) => ({
                createdAt: message.createdAt.toISOString(),
                id: message.id,
                ...(message.side ? { side: message.side } : {}),
                text: message.text,
                time: message.time,
                ...(message.type ? { type: message.type } : {})
            })),
            ...(row.operatorId ? { operatorId: row.operatorId } : {}),
            ...(row.operatorName ? { operatorName: row.operatorName } : {}),
            ...(row.queueId ? { queueId: row.queueId } : {}),
            slaTone: row.slaTone,
            status: row.status,
            ...(row.teamId ? { teamId: row.teamId } : {}),
            topic: row.topic,
            updatedAt: row.updatedAt.toISOString()
        }));
    }
    // Лёгкая выборка фасетов диалогов окна (без сообщений): наполняет селекты
    // фильтров выгрузки переписки даже там, где журнал lifecycle-событий пуст.
    async listConversationFacetRowsAsync(input) {
        if (!this.prismaClient?.conversation) {
            return [];
        }
        const rows = await this.prismaClient.conversation.findMany({
            orderBy: { createdAt: "asc" },
            select: { id: true, operatorId: true, operatorName: true, status: true, topic: true },
            where: {
                createdAt: { gte: input.from, lt: input.to },
                tenantId: input.tenantId
            }
        });
        return rows.map((row) => ({
            id: row.id,
            ...(row.operatorId ? { operatorId: row.operatorId } : {}),
            ...(row.operatorName ? { operatorName: row.operatorName } : {}),
            status: row.status,
            topic: row.topic
        }));
    }
    // Источник выгрузки переписки: диалоги, созданные в окне периода, вместе со
    // всеми сообщениями (включая внутренние комментарии) и последней CSAT-оценкой.
    async listConversationTranscriptSourceRowsAsync(input) {
        if (!this.prismaClient?.conversation) {
            return [];
        }
        const rows = await this.prismaClient.conversation.findMany({
            include: { messages: { orderBy: { createdAt: "asc" } } },
            orderBy: { createdAt: "asc" },
            where: {
                createdAt: { gte: input.from, lt: input.to },
                tenantId: input.tenantId
            }
        });
        const ratingRows = this.prismaClient.qualityRating && rows.length
            ? await this.prismaClient.qualityRating.findMany({
                orderBy: { createdAt: "asc" },
                where: {
                    conversationId: { in: rows.map((row) => row.id) },
                    tenantId: input.tenantId
                }
            })
            : [];
        const latestRatingByConversation = new Map();
        for (const rating of ratingRows) {
            latestRatingByConversation.set(rating.conversationId, rating);
        }
        return rows.map((row) => {
            const rating = latestRatingByConversation.get(row.id);
            return {
                channel: row.channel,
                clientName: row.name ?? "",
                createdAt: row.createdAt.toISOString(),
                id: row.id,
                messages: row.messages.map((message) => ({
                    ...(message.author ? { author: message.author } : {}),
                    createdAt: message.createdAt.toISOString(),
                    id: message.id,
                    ...(message.side ? { side: message.side } : {}),
                    text: message.text,
                    time: message.time,
                    ...(message.type ? { type: message.type } : {})
                })),
                ...(row.operatorId ? { operatorId: row.operatorId } : {}),
                ...(row.operatorName ? { operatorName: row.operatorName } : {}),
                ...(rating
                    ? { rating: { createdAt: rating.createdAt.toISOString(), scale: rating.scale, score: rating.score } }
                    : {}),
                ...(row.resolutionOutcome ? { resolutionOutcome: row.resolutionOutcome } : {}),
                status: row.status,
                topic: row.topic,
                updatedAt: row.updatedAt.toISOString()
            };
        });
    }
    async listRoutingActivityReportSourceRowsAsync(input) {
        if (!this.prismaClient?.routingAnalyticsRow) {
            return [];
        }
        const rows = await this.prismaClient.routingAnalyticsRow.findMany({
            orderBy: { occurredAt: "asc" },
            where: {
                tenantId: input.tenantId,
                occurredAt: { gte: input.from, lt: input.to },
                eventKind: input.eventType ?? { in: ["assignment", "transfer"] },
                ...(input.channel ? { channel: input.channel } : {}),
                ...(input.operatorId ? {
                    OR: [
                        { fromOperatorId: input.operatorId },
                        { toOperatorId: input.operatorId }
                    ]
                } : {})
            }
        });
        return rows.flatMap((row) => row.eventKind === "assignment" || row.eventKind === "transfer"
            ? [{
                    channel: row.channel,
                    conversationId: row.conversationId,
                    eventKind: row.eventKind,
                    fromOperatorId: row.fromOperatorId,
                    id: row.id,
                    occurredAt: row.occurredAt.toISOString(),
                    source: row.source,
                    tenantId: row.tenantId,
                    toOperatorId: row.toOperatorId
                }]
            : []);
    }
    saveState(state) {
        const current = this.readState();
        return this.store.write(normalizeState({
            ...state,
            exportRetryAuditEvents: [...current.exportRetryAuditEvents, ...(state.exportRetryAuditEvents ?? [])]
        }));
    }
    listExportJobs() {
        if (this.prismaClient) {
            throw new Error("prisma_report_export_jobs_async_required");
        }
        return clone(this.readState().exportJobs);
    }
    async listExportJobsAsync(filters = {}) {
        if (this.prismaClient) {
            const rows = await this.prismaClient.reportExportJob.findMany({
                orderBy: { createdAt: "desc" },
                ...(filters.tenantId ? { where: { tenantId: filters.tenantId } } : {})
            });
            return rows.map(toReportExportJob);
        }
        return this.listExportJobs().filter((job) => !filters.tenantId || readReportExportJobTenantId(job) === filters.tenantId);
    }
    async claimQueuedExportJobsAsync(input = {}) {
        const limit = normalizeClaimLimit(input.limit);
        const queue = normalizeExportQueue(input.queue);
        const now = input.now ?? new Date();
        const nowIso = now.toISOString();
        const staleBefore = new Date(now.getTime() - normalizeClaimLeaseMs(input.leaseMs)).toISOString();
        const claimJob = (job, claimToken) => ({
            ...job,
            filters: {
                ...(job.filters ?? {}),
                workerClaimToken: claimToken,
                workerClaimedAt: nowIso
            },
            progress: Math.max(job.progress, 20),
            queue,
            status: "Running",
            statusKey: "running"
        });
        if (this.prismaClient) {
            const rows = await this.prismaClient.reportExportJob.findMany({
                orderBy: { createdAt: "asc" },
                where: {
                    queue,
                    statusKey: { in: ["queued", "running"] }
                }
            });
            const claimed = [];
            const candidates = rows
                .filter((row) => row.statusKey === "queued" || row.updatedAt.toISOString() <= staleBefore)
                .slice(0, limit);
            for (const row of candidates) {
                const claimToken = `report_claim_${randomUUID()}`;
                const next = claimJob(toReportExportJob(row), claimToken);
                const result = await this.prismaClient.reportExportJob.updateMany({
                    data: {
                        filters: clone(next.filters ?? {}),
                        progress: next.progress,
                        queue,
                        status: next.status,
                        statusKey: next.statusKey,
                        updatedAt: now
                    },
                    where: {
                        id: row.id,
                        statusKey: row.statusKey,
                        updatedAt: row.updatedAt
                    }
                });
                if (result.count !== 1) {
                    continue;
                }
                const persisted = await this.prismaClient.reportExportJob.findUnique({ where: { id: row.id } });
                if (persisted) {
                    claimed.push(toReportExportJob(persisted));
                }
            }
            return claimed;
        }
        const claimed = [];
        this.store.update((state) => {
            const current = normalizeState(state);
            const claimableIds = current.exportJobs
                .filter((job) => (job.queue ?? "report-export") === queue)
                .filter((job) => job.statusKey === "queued" || (job.statusKey === "running"
                && String(job.filters?.workerClaimedAt ?? job.createdAt) <= staleBefore))
                .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
                .slice(0, limit)
                .map((job) => job.id);
            const claimable = new Set(claimableIds);
            const exportJobs = current.exportJobs.map((job) => {
                if (!claimable.has(job.id)) {
                    return job;
                }
                const next = claimJob(job, `report_claim_${randomUUID()}`);
                claimed.push(clone(next));
                return next;
            });
            return {
                ...current,
                exportJobs
            };
        });
        return clone(claimed);
    }
    listMetricDefinitions(filters = {}) {
        if (this.prismaClient) {
            return this.prismaClient.metricDefinition.findMany({
                orderBy: { updatedAt: "desc" },
                ...(filters.tenantId || filters.key ? { where: metricDefinitionWhere(filters) } : {})
            }).then((rows) => rows.map(toMetricDefinitionRecord));
        }
        return clone(this.readState().metricDefinitions.filter((metric) => isMetricDefinitionInScope(metric, filters)));
    }
    findMetricDefinition(metricId, filters = {}) {
        if (this.prismaClient) {
            return this.prismaClient.metricDefinition.findUnique({ where: { id: metricId } })
                .then((row) => {
                const metric = row ? toMetricDefinitionRecord(row) : undefined;
                return metric && isMetricDefinitionInScope(metric, filters) ? metric : undefined;
            });
        }
        return clone(this.readState().metricDefinitions.find((metric) => metric.id === metricId && isMetricDefinitionInScope(metric, filters)));
    }
    listMetricVersions(filters = {}) {
        if (this.prismaClient) {
            return this.prismaClient.metricVersion.findMany({
                orderBy: { updatedAt: "desc" },
                ...(filters.tenantId || filters.definitionId ? { where: metricVersionWhere(filters) } : {})
            }).then((rows) => rows.map(toMetricVersionRecord));
        }
        return clone(this.readState().metricVersions.filter((version) => isMetricVersionInScope(version, filters)));
    }
    findMetricVersion(versionId, filters = {}) {
        if (this.prismaClient) {
            return this.prismaClient.metricVersion.findUnique({ where: { id: versionId } })
                .then((row) => {
                const version = row ? toMetricVersionRecord(row) : undefined;
                return version && isMetricVersionInScope(version, filters) ? version : undefined;
            });
        }
        return clone(this.readState().metricVersions.find((version) => version.id === versionId && isMetricVersionInScope(version, filters)));
    }
    findActiveMetricVersion(tenantId, definitionId) {
        const versions = this.listMetricVersions({ definitionId, tenantId });
        if (isPromiseLike(versions)) {
            return versions.then(selectLatestActiveMetricVersion);
        }
        return selectLatestActiveMetricVersion(versions);
    }
    async resolveMetricVersion(tenantId, definitionId) {
        const overrides = await this.listMetricTenantOverrides({ definitionId, tenantId });
        const override = selectLatestMetricTenantOverride(overrides);
        if (override) {
            const overrideVersion = await this.findMetricVersion(override.metricVersionId, { tenantId });
            if (overrideVersion) {
                return overrideVersion;
            }
        }
        return this.findActiveMetricVersion(tenantId, definitionId);
    }
    listMetricTenantOverrides(filters = {}) {
        if (this.prismaClient) {
            return this.prismaClient.metricTenantOverride.findMany({
                orderBy: { updatedAt: "desc" },
                ...(filters.tenantId || filters.definitionId ? { where: metricTenantOverrideWhere(filters) } : {})
            }).then((rows) => rows.map(toMetricTenantOverrideRecord));
        }
        return clone(this.readState().metricTenantOverrides.filter((override) => isMetricTenantOverrideInScope(override, filters)));
    }
    listReportQueryExecutions() {
        if (this.prismaClient) {
            throw new Error("prisma_report_query_executions_async_required");
        }
        return clone(this.readState().reportQueryExecutions);
    }
    async listReportQueryExecutionsAsync() {
        if (this.prismaClient) {
            const rows = await this.prismaClient.reportQueryExecution.findMany({ orderBy: { createdAt: "desc" } });
            return rows.map(toReportQueryExecutionRecord);
        }
        return this.listReportQueryExecutions();
    }
    listReportFileDescriptors() {
        if (this.prismaClient) {
            throw new Error("prisma_report_file_descriptors_async_required");
        }
        return clone(this.readState().reportFileDescriptors);
    }
    async listReportFileDescriptorsAsync() {
        if (this.prismaClient) {
            const rows = await this.prismaClient.reportFileDescriptor.findMany({ orderBy: { createdAt: "desc" } });
            return rows.map(toReportFileDescriptorRecord);
        }
        return this.listReportFileDescriptors();
    }
    listReportNotificationDescriptors() {
        if (this.prismaClient) {
            throw new Error("prisma_report_notification_descriptors_async_required");
        }
        return clone(this.readState().reportNotificationDescriptors);
    }
    async listReportNotificationDescriptorsAsync() {
        if (this.prismaClient) {
            const rows = await this.prismaClient.reportNotificationDescriptor.findMany({ orderBy: { createdAt: "desc" } });
            return rows.map(toReportNotificationDescriptorRecord);
        }
        return this.listReportNotificationDescriptors();
    }
    findReportFileDescriptor(jobId) {
        if (this.prismaClient) {
            throw new Error("prisma_report_file_descriptors_async_required");
        }
        return clone(this.readState().reportFileDescriptors.find((descriptor) => descriptor.jobId === jobId));
    }
    async findReportFileDescriptorAsync(jobId) {
        if (this.prismaClient) {
            const row = await this.prismaClient.reportFileDescriptor.findUnique({ where: { jobId } });
            return row ? toReportFileDescriptorRecord(row) : undefined;
        }
        return this.findReportFileDescriptor(jobId);
    }
    listSavedReportTemplates(filters = {}) {
        if (this.prismaClient) {
            return this.prismaClient.savedReportTemplate.findMany({
                orderBy: { updatedAt: "desc" },
                ...(filters.tenantId ? { where: savedReportTemplateWhere(filters) } : {})
            }).then((rows) => rows
                .map(toSavedReportTemplateRecord)
                .filter((template) => isSavedReportTemplateInScope(template, filters)));
        }
        return clone(this.readState().savedReportTemplates.filter((template) => isSavedReportTemplateInScope(template, filters)));
    }
    findSavedReportTemplate(templateId, filters = {}) {
        if (this.prismaClient) {
            return this.prismaClient.savedReportTemplate.findUnique({ where: { id: templateId } })
                .then((row) => {
                const template = row ? toSavedReportTemplateRecord(row) : undefined;
                return template && isSavedReportTemplateInScope(template, filters) ? template : undefined;
            });
        }
        return clone(this.readState().savedReportTemplates.find((template) => template.id === templateId && isSavedReportTemplateInScope(template, filters)));
    }
    listScheduledDigestDescriptors(filters = {}) {
        if (this.prismaClient) {
            throw new Error("prisma_scheduled_digest_descriptors_async_required");
        }
        return clone(this.readState().scheduledDigestDescriptors.filter((descriptor) => isScheduledDigestDescriptorInScope(descriptor, filters))
            .sort(compareScheduledDigestDescriptors));
    }
    async listScheduledDigestDescriptorsAsync(filters = {}) {
        if (this.prismaClient) {
            const rows = await this.prismaClient.scheduledDigestDescriptor.findMany({
                orderBy: { dueAt: "asc" },
                ...(hasScheduledDigestDescriptorWhere(filters) ? { where: scheduledDigestDescriptorWhere(filters) } : {})
            });
            return rows.map(toScheduledDigestDescriptorRecord);
        }
        return this.listScheduledDigestDescriptors(filters);
    }
    claimScheduledDigestDescriptors(input) {
        if (this.prismaClient) {
            throw new Error("prisma_scheduled_digest_descriptors_async_required");
        }
        const { limit, nowIso, staleBefore } = normalizeScheduledDigestClaimInput(input);
        const claimed = [];
        this.store.update((state) => {
            const current = normalizeState(state);
            const claimableIds = new Set(current.scheduledDigestDescriptors
                .filter((descriptor) => input.tenantId === undefined || descriptor.tenantId === input.tenantId)
                .filter((descriptor) => descriptor.dueAt <= nowIso)
                .filter((descriptor) => descriptor.status === "due"
                || (descriptor.status === "running" && descriptor.updatedAt <= staleBefore))
                .sort(compareScheduledDigestDescriptors)
                .slice(0, limit)
                .map((descriptor) => descriptor.id));
            return {
                ...current,
                scheduledDigestDescriptors: current.scheduledDigestDescriptors.map((descriptor) => {
                    if (!claimableIds.has(descriptor.id)) {
                        return descriptor;
                    }
                    const next = normalizeScheduledDigestDescriptor({
                        ...descriptor,
                        status: "running",
                        updatedAt: nowIso
                    });
                    claimed.push(clone(next));
                    return next;
                })
            };
        });
        return claimed;
    }
    async claimScheduledDigestDescriptorsAsync(input) {
        if (!this.prismaClient) {
            return this.claimScheduledDigestDescriptors(input);
        }
        const { limit, now, staleBefore } = normalizeScheduledDigestClaimInput(input);
        const rows = await this.prismaClient.scheduledDigestDescriptor.findMany({
            orderBy: { dueAt: "asc" },
            where: {
                dueAt: { lte: now },
                ...(input.tenantId !== undefined ? { tenantId: input.tenantId } : {})
            }
        });
        const candidates = rows.map(toScheduledDigestDescriptorRecord)
            .filter((descriptor) => descriptor.status === "due"
            || (descriptor.status === "running" && descriptor.updatedAt <= staleBefore))
            .slice(0, limit);
        const claimed = [];
        for (const candidate of candidates) {
            const result = await this.prismaClient.scheduledDigestDescriptor.updateMany({
                data: {
                    status: "running",
                    updatedAt: now
                },
                where: {
                    id: candidate.id,
                    status: candidate.status,
                    updatedAt: new Date(candidate.updatedAt)
                }
            });
            if (result.count !== 1) {
                continue;
            }
            const row = await this.prismaClient.scheduledDigestDescriptor.findUnique({ where: { id: candidate.id } });
            if (row) {
                claimed.push(toScheduledDigestDescriptorRecord(row));
            }
        }
        return claimed;
    }
    findScheduledDigestDescriptor(descriptorId, filters = {}) {
        if (this.prismaClient) {
            throw new Error("prisma_scheduled_digest_descriptors_async_required");
        }
        return clone(this.readState().scheduledDigestDescriptors.find((descriptor) => descriptor.id === descriptorId && isScheduledDigestDescriptorInScope(descriptor, filters)));
    }
    async findScheduledDigestDescriptorAsync(descriptorId, filters = {}) {
        if (this.prismaClient) {
            const row = await this.prismaClient.scheduledDigestDescriptor.findUnique({ where: { id: descriptorId } });
            const descriptor = row ? toScheduledDigestDescriptorRecord(row) : undefined;
            return descriptor && isScheduledDigestDescriptorInScope(descriptor, filters) ? descriptor : undefined;
        }
        return this.findScheduledDigestDescriptor(descriptorId, filters);
    }
    deleteReportFileDescriptor(jobId) {
        if (this.prismaClient) {
            throw new Error("prisma_report_file_descriptors_async_required");
        }
        this.store.update((state) => {
            const current = normalizeState(state);
            return {
                ...current,
                reportFileDescriptors: current.reportFileDescriptors.filter((descriptor) => descriptor.jobId !== jobId)
            };
        });
    }
    async deleteReportFileDescriptorAsync(jobId) {
        if (this.prismaClient) {
            await this.prismaClient.reportFileDescriptor.deleteMany({ where: { jobId } });
            return;
        }
        this.deleteReportFileDescriptor(jobId);
    }
    findMetricTenantOverride(overrideId, filters = {}) {
        if (this.prismaClient) {
            return this.prismaClient.metricTenantOverride.findUnique({ where: { id: overrideId } })
                .then((row) => {
                const override = row ? toMetricTenantOverrideRecord(row) : undefined;
                return override && isMetricTenantOverrideInScope(override, filters) ? override : undefined;
            });
        }
        return clone(this.readState().metricTenantOverrides.find((override) => override.id === overrideId && isMetricTenantOverrideInScope(override, filters)));
    }
    saveExportJob(job) {
        const persisted = clone(job);
        if (this.prismaClient) {
            throw new Error("prisma_report_export_jobs_async_required");
        }
        this.store.update((state) => {
            const current = normalizeState(state);
            const exists = current.exportJobs.some((item) => item.id === persisted.id);
            return {
                ...current,
                exportJobs: exists
                    ? current.exportJobs.map((item) => item.id === persisted.id ? persisted : item)
                    : [persisted, ...current.exportJobs]
            };
        });
        return clone(persisted);
    }
    async saveExportJobAsync(job) {
        if (this.prismaClient) {
            const create = toPrismaReportExportJobCreateInput(job);
            const row = await this.prismaClient.reportExportJob.upsert({
                create,
                update: toPrismaReportExportJobUpdateInput(create),
                where: { id: create.id }
            });
            return toReportExportJob(row);
        }
        return this.saveExportJob(job);
    }
    saveExportJobWithIdempotency(job, idempotencyKey) {
        const persistedJob = clone(job);
        const persistedKey = normalizeReportIdempotencyRecord(idempotencyKey);
        if (persistedJob.tenantId !== persistedKey.tenantId) {
            throw new Error("report_idempotency_tenant_mismatch");
        }
        let result;
        if (this.prismaClient) {
            return this.savePrismaExportJobWithIdempotency(persistedJob, persistedKey);
        }
        this.store.update((state) => {
            const current = normalizeState(state);
            const existingKey = current.idempotencyKeys.find((item) => item.tenantId === persistedKey.tenantId && item.key === persistedKey.key);
            if (existingKey && existingKey.fingerprint !== persistedKey.fingerprint) {
                result = {
                    idempotencyKey: clone(existingKey),
                    status: "conflict"
                };
                return current;
            }
            if (existingKey) {
                const existingJob = current.exportJobs.find((item) => item.id === existingKey.jobId);
                if (existingJob) {
                    result = {
                        idempotencyKey: clone(existingKey),
                        job: clone(existingJob),
                        status: "duplicate"
                    };
                    return current;
                }
            }
            result = {
                idempotencyKey: persistedKey,
                job: persistedJob,
                status: "created"
            };
            return {
                ...current,
                exportJobs: [persistedJob, ...current.exportJobs.filter((item) => item.id !== persistedJob.id)],
                idempotencyKeys: existingKey
                    ? current.idempotencyKeys.map((item) => item.tenantId === persistedKey.tenantId && item.key === persistedKey.key ? persistedKey : item)
                    : [...current.idempotencyKeys, persistedKey]
            };
        });
        return clone(result);
    }
    saveRetriedExportJob(job, auditEvent) {
        const persistedJob = clone(job);
        const persistedAuditEvent = clone(auditEvent);
        if (this.prismaClient) {
            throw new Error("prisma_report_export_jobs_async_required");
        }
        this.store.update((state) => {
            const current = normalizeState(state);
            const exists = current.exportJobs.some((item) => item.id === persistedJob.id);
            return {
                ...current,
                exportJobs: exists
                    ? current.exportJobs.map((item) => item.id === persistedJob.id ? persistedJob : item)
                    : [persistedJob, ...current.exportJobs],
                exportRetryAuditEvents: [...current.exportRetryAuditEvents, persistedAuditEvent]
            };
        });
        return {
            auditEvent: clone(persistedAuditEvent),
            job: clone(persistedJob)
        };
    }
    async saveRetriedExportJobAsync(job, auditEvent) {
        if (this.prismaClient) {
            const persistedJob = await this.saveExportJobAsync(job);
            const create = toPrismaReportExportRetryAuditEventCreateInput(auditEvent);
            const persistedAuditEvent = await this.prismaClient.reportExportRetryAuditEvent.upsert({
                create,
                update: toPrismaReportExportRetryAuditEventUpdateInput(create),
                where: { auditId: create.auditId }
            });
            return {
                auditEvent: toExportRetryAuditEvent(persistedAuditEvent),
                job: persistedJob
            };
        }
        return this.saveRetriedExportJob(job, auditEvent);
    }
    async listExportRetryAuditEventsAsync() {
        if (this.prismaClient) {
            const rows = await this.prismaClient.reportExportRetryAuditEvent.findMany({ orderBy: { at: "desc" } });
            return rows.map(toExportRetryAuditEvent);
        }
        return clone(this.readState().exportRetryAuditEvents);
    }
    findIdempotencyKey(tenantId, key) {
        if (this.prismaClient) {
            return this.prismaClient.reportIdempotencyKey.findUnique({ where: reportIdempotencyWhere(tenantId, key) })
                .then((row) => row ? toReportIdempotencyRecord(row) : undefined);
        }
        return clone(this.readState().idempotencyKeys.find((item) => item.tenantId === tenantId && item.key === key));
    }
    saveIdempotencyKey(record) {
        const persisted = normalizeReportIdempotencyRecord(record);
        if (this.prismaClient) {
            return this.prismaClient.reportIdempotencyKey.upsert({
                create: toPrismaReportIdempotencyKeyCreateInput(persisted),
                update: toPrismaReportIdempotencyKeyUpdateInput(persisted),
                where: reportIdempotencyWhere(persisted.tenantId, persisted.key)
            }).then(toReportIdempotencyRecord);
        }
        this.store.update((state) => {
            const current = normalizeState(state);
            const exists = current.idempotencyKeys.some((item) => item.tenantId === persisted.tenantId && item.key === persisted.key);
            return {
                ...current,
                idempotencyKeys: exists
                    ? current.idempotencyKeys.map((item) => item.tenantId === persisted.tenantId && item.key === persisted.key ? persisted : item)
                    : [...current.idempotencyKeys, persisted]
            };
        });
        return clone(persisted);
    }
    saveMetricDefinition(metric) {
        const persisted = normalizeMetricDefinition(metric);
        if (this.prismaClient) {
            const create = toPrismaMetricDefinitionCreateInput(persisted);
            return this.prismaClient.metricDefinition.upsert({
                create,
                update: toPrismaMetricDefinitionUpdateInput(create),
                where: { id: persisted.id }
            }).then(toMetricDefinitionRecord);
        }
        this.store.update((state) => {
            const current = normalizeState(state);
            const exists = current.metricDefinitions.some((item) => item.id === persisted.id);
            return {
                ...current,
                metricDefinitions: exists
                    ? current.metricDefinitions.map((item) => item.id === persisted.id ? persisted : item)
                    : [...current.metricDefinitions, persisted]
            };
        });
        return clone(persisted);
    }
    saveMetricVersion(version) {
        const persisted = normalizeMetricVersion(version);
        if (this.prismaClient) {
            const create = toPrismaMetricVersionCreateInput(persisted);
            return this.prismaClient.metricVersion.upsert({
                create,
                update: toPrismaMetricVersionUpdateInput(create),
                where: { id: persisted.id }
            }).then(toMetricVersionRecord);
        }
        this.store.update((state) => {
            const current = normalizeState(state);
            const exists = current.metricVersions.some((item) => item.id === persisted.id);
            return {
                ...current,
                metricVersions: exists
                    ? current.metricVersions.map((item) => item.id === persisted.id ? persisted : item)
                    : [...current.metricVersions, persisted]
            };
        });
        return clone(persisted);
    }
    saveMetricTenantOverride(override) {
        const persisted = normalizeMetricTenantOverride(override);
        if (this.prismaClient) {
            const create = toPrismaMetricTenantOverrideCreateInput(persisted);
            return this.prismaClient.metricTenantOverride.upsert({
                create,
                update: toPrismaMetricTenantOverrideUpdateInput(create),
                where: { id: persisted.id }
            }).then(toMetricTenantOverrideRecord);
        }
        this.store.update((state) => {
            const current = normalizeState(state);
            const exists = current.metricTenantOverrides.some((item) => item.id === persisted.id);
            return {
                ...current,
                metricTenantOverrides: exists
                    ? current.metricTenantOverrides.map((item) => item.id === persisted.id ? persisted : item)
                    : [...current.metricTenantOverrides, persisted]
            };
        });
        return clone(persisted);
    }
    saveReportQueryExecution(execution) {
        const persisted = normalizeReportQueryExecution(execution);
        if (this.prismaClient) {
            throw new Error("prisma_report_query_executions_async_required");
        }
        this.store.update((state) => {
            const current = normalizeState(state);
            const exists = current.reportQueryExecutions.some((item) => item.id === persisted.id);
            return {
                ...current,
                reportQueryExecutions: exists
                    ? current.reportQueryExecutions.map((item) => item.id === persisted.id ? persisted : item)
                    : [...current.reportQueryExecutions, persisted]
            };
        });
        return clone(persisted);
    }
    async saveReportQueryExecutionAsync(execution) {
        const persisted = normalizeReportQueryExecution(execution);
        if (this.prismaClient) {
            const create = toPrismaReportQueryExecutionCreateInput(persisted);
            const row = await this.prismaClient.reportQueryExecution.upsert({
                create,
                update: toPrismaReportQueryExecutionUpdateInput(create),
                where: { id: create.id }
            });
            return toReportQueryExecutionRecord(row);
        }
        return this.saveReportQueryExecution(persisted);
    }
    saveReportFileDescriptor(descriptor) {
        const persisted = normalizeReportFileDescriptor(descriptor);
        if (this.prismaClient) {
            throw new Error("prisma_report_file_descriptors_async_required");
        }
        this.store.update((state) => {
            const current = normalizeState(state);
            const exists = current.reportFileDescriptors.some((item) => item.jobId === persisted.jobId);
            return {
                ...current,
                reportFileDescriptors: exists
                    ? current.reportFileDescriptors.map((item) => item.jobId === persisted.jobId ? persisted : item)
                    : [...current.reportFileDescriptors, persisted]
            };
        });
        return clone(persisted);
    }
    async saveReportFileDescriptorAsync(descriptor) {
        const persisted = normalizeReportFileDescriptor(descriptor);
        if (this.prismaClient) {
            const create = toPrismaReportFileDescriptorCreateInput(persisted);
            const row = await this.prismaClient.reportFileDescriptor.upsert({
                create,
                update: toPrismaReportFileDescriptorUpdateInput(create),
                where: { jobId: create.jobId }
            });
            return toReportFileDescriptorRecord(row);
        }
        return this.saveReportFileDescriptor(persisted);
    }
    saveSavedReportTemplate(template) {
        const persisted = normalizeSavedReportTemplate(template);
        if (this.prismaClient) {
            const create = toPrismaSavedReportTemplateCreateInput(persisted);
            return this.prismaClient.savedReportTemplate.upsert({
                create,
                update: toPrismaSavedReportTemplateUpdateInput(create),
                where: { id: persisted.id }
            }).then(toSavedReportTemplateRecord);
        }
        this.store.update((state) => {
            const current = normalizeState(state);
            const exists = current.savedReportTemplates.some((item) => item.id === persisted.id);
            return {
                ...current,
                savedReportTemplates: exists
                    ? current.savedReportTemplates.map((item) => item.id === persisted.id ? persisted : item)
                    : [...current.savedReportTemplates, persisted]
            };
        });
        return clone(persisted);
    }
    saveReportNotificationDescriptor(descriptor) {
        const persisted = normalizeReportNotificationDescriptor(descriptor);
        if (this.prismaClient) {
            throw new Error("prisma_report_notification_descriptors_async_required");
        }
        const currentState = this.readState();
        const existing = currentState.reportNotificationDescriptors.find((item) => item.idempotencyKey === persisted.idempotencyKey);
        if (existing) {
            return clone(existing);
        }
        this.store.update((state) => {
            const current = normalizeState(state);
            return {
                ...current,
                reportNotificationDescriptors: [...current.reportNotificationDescriptors, persisted]
            };
        });
        return clone(persisted);
    }
    async saveReportNotificationDescriptorAsync(descriptor) {
        const persisted = normalizeReportNotificationDescriptor(descriptor);
        if (this.prismaClient) {
            const existing = await this.prismaClient.reportNotificationDescriptor.findUnique({ where: { idempotencyKey: persisted.idempotencyKey } });
            if (existing) {
                return toReportNotificationDescriptorRecord(existing);
            }
            const create = toPrismaReportNotificationDescriptorCreateInput(persisted);
            const row = await this.prismaClient.reportNotificationDescriptor.upsert({
                create,
                update: toPrismaReportNotificationDescriptorUpdateInput(create),
                where: { idempotencyKey: create.idempotencyKey }
            });
            return toReportNotificationDescriptorRecord(row);
        }
        return this.saveReportNotificationDescriptor(persisted);
    }
    saveScheduledDigestDescriptor(descriptor) {
        const persisted = normalizeScheduledDigestDescriptor(descriptor);
        if (this.prismaClient) {
            throw new Error("prisma_scheduled_digest_descriptors_async_required");
        }
        const currentState = this.readState();
        const existingById = currentState.scheduledDigestDescriptors.find((item) => item.id === persisted.id);
        if (existingById && !isDuplicateScheduledDigestPeriodReplay(existingById, persisted)) {
            throw new Error("scheduled_digest_period_conflict");
        }
        if (!existingById) {
            const existingPeriodDescriptor = currentState.scheduledDigestDescriptors.find((item) => isSameScheduledDigestPeriod(item, persisted));
            if (existingPeriodDescriptor) {
                if (!isDuplicateScheduledDigestPeriodReplay(existingPeriodDescriptor, persisted)) {
                    throw new Error("scheduled_digest_period_conflict");
                }
                return clone(existingPeriodDescriptor);
            }
        }
        this.store.update((state) => {
            const current = normalizeState(state);
            const exists = current.scheduledDigestDescriptors.some((item) => item.id === persisted.id);
            return {
                ...current,
                scheduledDigestDescriptors: exists
                    ? current.scheduledDigestDescriptors.map((item) => item.id === persisted.id ? persisted : item)
                    : [...current.scheduledDigestDescriptors, persisted]
            };
        });
        return clone(persisted);
    }
    async saveScheduledDigestDescriptorAsync(descriptor) {
        const persisted = normalizeScheduledDigestDescriptor(descriptor);
        if (this.prismaClient) {
            const existingByIdRow = await this.prismaClient.scheduledDigestDescriptor.findUnique({ where: { id: persisted.id } });
            const existingById = existingByIdRow ? toScheduledDigestDescriptorRecord(existingByIdRow) : undefined;
            if (existingById && !isDuplicateScheduledDigestPeriodReplay(existingById, persisted)) {
                throw new Error("scheduled_digest_period_conflict");
            }
            if (!existingById) {
                const periodRows = await this.prismaClient.scheduledDigestDescriptor.findMany({
                    orderBy: { dueAt: "asc" },
                    where: { tenantId: persisted.tenantId }
                });
                const existingPeriodDescriptor = periodRows.map(toScheduledDigestDescriptorRecord)
                    .find((item) => isSameScheduledDigestPeriod(item, persisted));
                if (existingPeriodDescriptor) {
                    if (!isDuplicateScheduledDigestPeriodReplay(existingPeriodDescriptor, persisted)) {
                        throw new Error("scheduled_digest_period_conflict");
                    }
                    return clone(existingPeriodDescriptor);
                }
            }
            const create = toPrismaScheduledDigestDescriptorCreateInput(persisted);
            const row = await this.prismaClient.scheduledDigestDescriptor.upsert({
                create,
                update: toPrismaScheduledDigestDescriptorUpdateInput(create),
                where: { id: create.id }
            });
            return toScheduledDigestDescriptorRecord(row);
        }
        return this.saveScheduledDigestDescriptor(persisted);
    }
    async savePrismaExportJobWithIdempotency(job, idempotencyKey) {
        const client = this.prismaClient;
        try {
            return await client.$transaction(async (transaction) => {
                const existingKey = await transaction.reportIdempotencyKey.findUnique({
                    where: reportIdempotencyWhere(idempotencyKey.tenantId, idempotencyKey.key)
                });
                if (existingKey) {
                    return resolvePrismaExportIdempotency(transaction, toReportIdempotencyRecord(existingKey), idempotencyKey.fingerprint);
                }
                const createJob = toPrismaReportExportJobCreateInput(job);
                const row = await transaction.reportExportJob.upsert({
                    create: createJob,
                    update: toPrismaReportExportJobUpdateInput(createJob),
                    where: { id: createJob.id }
                });
                const keyRow = await transaction.reportIdempotencyKey.create({
                    data: toPrismaReportIdempotencyKeyCreateInput(idempotencyKey)
                });
                return {
                    idempotencyKey: toReportIdempotencyRecord(keyRow),
                    job: toReportExportJob(row),
                    status: "created"
                };
            }, { isolationLevel: "Serializable" });
        }
        catch (error) {
            if (!isUniqueConstraintError(error)) {
                throw error;
            }
            const existingKey = await client.reportIdempotencyKey.findUnique({
                where: reportIdempotencyWhere(idempotencyKey.tenantId, idempotencyKey.key)
            });
            if (!existingKey) {
                throw error;
            }
            return resolvePrismaExportIdempotency(client, toReportIdempotencyRecord(existingKey), idempotencyKey.fingerprint);
        }
    }
}
export function createEmptyReportState() {
    return {
        exportRetryAuditEvents: [],
        exportJobs: [],
        idempotencyKeys: [],
        metricDefinitions: [],
        metricTenantOverrides: [],
        metricVersions: [],
        reportFileDescriptors: [],
        reportNotificationDescriptors: [],
        reportQueryExecutions: [],
        savedReportTemplates: [],
        scheduledDigestDescriptors: [],
        workspace: emptyReportWorkspace()
    };
}
function emptyReportWorkspace() {
    return {
        metricDefinitionVersion: REPORT_METRIC_DEFINITION_VERSION,
        reportBars: [],
        reportChartBlocks: [],
        reportColumnOptions: clone(REPORT_COLUMN_OPTIONS),
        reportRows: [],
        rescueOutcomeSummary: [],
        rescueReportRows: []
    };
}
async function resolvePrismaExportIdempotency(client, existingKey, requestedFingerprint) {
    if (existingKey.fingerprint !== requestedFingerprint) {
        return {
            idempotencyKey: clone(existingKey),
            status: "conflict"
        };
    }
    const existingJob = await client.reportExportJob.findUnique({ where: { id: existingKey.jobId } });
    if (!existingJob) {
        return {
            idempotencyKey: clone(existingKey),
            status: "conflict"
        };
    }
    return {
        idempotencyKey: clone(existingKey),
        job: toReportExportJob(existingJob),
        status: "duplicate"
    };
}
function assertCompletePrismaReportClient(client) {
    if (!client.metricDefinition) {
        throw new Error("prisma_report_metric_definition_delegate_required");
    }
    if (!client.metricVersion) {
        throw new Error("prisma_report_metric_version_delegate_required");
    }
    if (!client.metricTenantOverride) {
        throw new Error("prisma_report_metric_tenant_override_delegate_required");
    }
    if (!client.savedReportTemplate) {
        throw new Error("prisma_report_saved_template_delegate_required");
    }
    if (!client.reportIdempotencyKey) {
        throw new Error("prisma_report_idempotency_delegate_required");
    }
    if (!client.reportExportJob) {
        throw new Error("prisma_report_export_job_delegate_required");
    }
    if (!client.reportQueryExecution) {
        throw new Error("prisma_report_query_execution_delegate_required");
    }
    if (!client.reportFileDescriptor) {
        throw new Error("prisma_report_file_descriptor_delegate_required");
    }
    if (!client.reportNotificationDescriptor) {
        throw new Error("prisma_report_notification_descriptor_delegate_required");
    }
    if (!client.scheduledDigestDescriptor) {
        throw new Error("prisma_scheduled_digest_delegate_required");
    }
    if (!client.reportExportRetryAuditEvent) {
        throw new Error("prisma_report_export_retry_audit_delegate_required");
    }
    if (!client.$transaction) {
        throw new Error("prisma_report_transaction_required");
    }
}
function normalizeState(state) {
    return {
        exportRetryAuditEvents: state.exportRetryAuditEvents ?? [],
        exportJobs: state.exportJobs ?? [],
        idempotencyKeys: (state.idempotencyKeys ?? []).map(normalizeReportIdempotencyRecord),
        metricDefinitions: (state.metricDefinitions ?? []).map(normalizeMetricDefinition),
        metricTenantOverrides: (state.metricTenantOverrides ?? []).map(normalizeMetricTenantOverride),
        metricVersions: (state.metricVersions ?? []).map(normalizeMetricVersion),
        reportFileDescriptors: (state.reportFileDescriptors ?? []).map(normalizeReportFileDescriptor),
        reportNotificationDescriptors: (state.reportNotificationDescriptors ?? []).map(normalizeReportNotificationDescriptor),
        reportQueryExecutions: (state.reportQueryExecutions ?? []).map(normalizeReportQueryExecution),
        savedReportTemplates: (state.savedReportTemplates ?? []).map(normalizeSavedReportTemplate),
        scheduledDigestDescriptors: (state.scheduledDigestDescriptors ?? []).map(normalizeScheduledDigestDescriptor),
        workspace: state.workspace ?? emptyReportWorkspace()
    };
}
function isMetricDefinitionInScope(metric, filters) {
    return (!filters.tenantId || metric.tenantId === filters.tenantId)
        && (!filters.key || metric.key === filters.key);
}
function normalizeMetricDefinition(metric) {
    const key = requireNonEmpty(metric.key, "metric_definition_key_required");
    return {
        createdAt: metric.createdAt,
        description: metric.description.trim(),
        id: metric.id,
        key,
        name: metric.name.trim(),
        source: metric.source.trim(),
        tenantId: metric.tenantId,
        unit: metric.unit.trim(),
        updatedAt: metric.updatedAt
    };
}
function metricDefinitionWhere(filters) {
    return {
        ...(filters.key ? { key: filters.key } : {}),
        ...(filters.tenantId ? { tenantId: filters.tenantId } : {})
    };
}
function toPrismaMetricDefinitionCreateInput(metric) {
    return {
        createdAt: new Date(metric.createdAt),
        description: metric.description,
        id: metric.id,
        key: metric.key,
        name: metric.name,
        source: metric.source,
        tenantId: metric.tenantId,
        unit: metric.unit,
        updatedAt: new Date(metric.updatedAt)
    };
}
function toPrismaMetricDefinitionUpdateInput(create) {
    return {
        description: create.description,
        key: create.key,
        name: create.name,
        source: create.source,
        tenantId: create.tenantId,
        unit: create.unit,
        updatedAt: create.updatedAt
    };
}
function toMetricDefinitionRecord(row) {
    return {
        createdAt: row.createdAt.toISOString(),
        description: row.description,
        id: row.id,
        key: row.key,
        name: row.name,
        source: row.source,
        tenantId: row.tenantId,
        unit: row.unit,
        updatedAt: row.updatedAt.toISOString()
    };
}
function isMetricVersionInScope(version, filters) {
    return (!filters.tenantId || version.tenantId === filters.tenantId)
        && (!filters.definitionId || version.definitionId === filters.definitionId);
}
function normalizeMetricVersion(version) {
    const queryKey = requireNonEmpty(version.queryKey, "metric_version_query_key_required");
    return {
        createdAt: version.createdAt,
        definitionId: version.definitionId,
        id: version.id,
        queryKey,
        status: parseMetricVersionStatus(version.status),
        tenantId: version.tenantId,
        updatedAt: version.updatedAt,
        version: version.version.trim()
    };
}
function metricVersionWhere(filters) {
    return {
        ...(filters.definitionId ? { definitionId: filters.definitionId } : {}),
        ...(filters.tenantId ? { tenantId: filters.tenantId } : {})
    };
}
function toPrismaMetricVersionCreateInput(version) {
    return {
        createdAt: new Date(version.createdAt),
        definitionId: version.definitionId,
        id: version.id,
        queryKey: version.queryKey,
        status: version.status,
        tenantId: version.tenantId,
        updatedAt: new Date(version.updatedAt),
        version: version.version
    };
}
function toPrismaMetricVersionUpdateInput(create) {
    return {
        definitionId: create.definitionId,
        queryKey: create.queryKey,
        status: create.status,
        tenantId: create.tenantId,
        updatedAt: create.updatedAt,
        version: create.version
    };
}
function toMetricVersionRecord(row) {
    return {
        createdAt: row.createdAt.toISOString(),
        definitionId: row.definitionId,
        id: row.id,
        queryKey: row.queryKey,
        status: parseMetricVersionStatus(row.status),
        tenantId: row.tenantId,
        updatedAt: row.updatedAt.toISOString(),
        version: row.version
    };
}
function parseMetricVersionStatus(status) {
    if (status === "active" || status === "draft" || status === "retired") {
        return status;
    }
    throw new Error(`Unsupported metric version status: ${status}`);
}
function selectLatestActiveMetricVersion(versions) {
    return clone(versions)
        .filter((version) => version.status === "active")
        .sort(compareMetricVersionsForSelection)[0];
}
function compareMetricVersionsForSelection(left, right) {
    const updated = Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
    if (updated !== 0) {
        return updated;
    }
    const version = right.version.localeCompare(left.version, "en", { numeric: true, sensitivity: "base" });
    if (version !== 0) {
        return version;
    }
    return left.id.localeCompare(right.id);
}
function selectLatestMetricTenantOverride(overrides) {
    return clone(overrides)
        .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0];
}
function isMetricTenantOverrideInScope(override, filters) {
    return (!filters.tenantId || override.tenantId === filters.tenantId)
        && (!filters.definitionId || override.definitionId === filters.definitionId);
}
function normalizeMetricTenantOverride(override) {
    const metricVersionId = requireNonEmpty(override.metricVersionId, "metric_tenant_override_metric_version_required");
    return {
        createdAt: override.createdAt,
        definitionId: override.definitionId,
        id: override.id,
        metricVersionId,
        reason: override.reason.trim(),
        tenantId: override.tenantId,
        updatedAt: override.updatedAt
    };
}
function normalizeReportQueryExecution(execution) {
    return {
        ...(execution.failureEnvelope ? { failureEnvelope: normalizeFailureEnvelope(execution.failureEnvelope) } : {}),
        id: requireNonEmpty(execution.id, "report_query_execution_id_required"),
        metricKey: requireNonEmpty(execution.metricKey, "report_query_execution_metric_key_required"),
        ...(execution.parameters ? { parameters: clone(execution.parameters) } : {}),
        status: parseReportQueryExecutionStatus(execution.status)
    };
}
function normalizeReportFileDescriptor(descriptor) {
    return {
        checksum: requireNonEmpty(descriptor.checksum, "report_file_descriptor_checksum_required"),
        contentType: requireNonEmpty(descriptor.contentType, "report_file_descriptor_content_type_required"),
        createdAt: requireNonEmpty(descriptor.createdAt, "report_file_descriptor_created_at_required"),
        fileName: requireNonEmpty(descriptor.fileName, "report_file_descriptor_file_name_required"),
        format: requireNonEmpty(descriptor.format, "report_file_descriptor_format_required"),
        id: requireNonEmpty(descriptor.id, "report_file_descriptor_id_required"),
        jobId: requireNonEmpty(descriptor.jobId, "report_file_descriptor_job_id_required"),
        metricDefinitionVersion: requireNonEmpty(descriptor.metricDefinitionVersion, "report_file_descriptor_metric_definition_version_required"),
        objectKey: requireNonEmpty(descriptor.objectKey, "report_file_descriptor_object_key_required"),
        sizeBytes: descriptor.sizeBytes,
        tenantId: requireNonEmpty(descriptor.tenantId, "report_file_descriptor_tenant_id_required"),
        writtenAt: requireNonEmpty(descriptor.writtenAt, "report_file_descriptor_written_at_required")
    };
}
function normalizeReportNotificationDescriptor(descriptor) {
    return {
        createdAt: requireIsoDate(descriptor.createdAt, "report_notification_created_at_invalid"),
        eventType: parseReportNotificationEventType(descriptor.eventType),
        exportJobId: requireNonEmpty(descriptor.exportJobId, "report_notification_export_job_id_required"),
        id: requireNonEmpty(descriptor.id, "report_notification_id_required"),
        idempotencyKey: requireNonEmpty(descriptor.idempotencyKey, "report_notification_idempotency_key_required"),
        payload: clone(descriptor.payload),
        status: parseReportNotificationStatus(descriptor.status),
        tenantId: requireNonEmpty(descriptor.tenantId, "report_notification_tenant_id_required")
    };
}
function parseReportNotificationEventType(eventType) {
    if (eventType === "export.ready") {
        return eventType;
    }
    throw new Error(`Unsupported report notification event type: ${eventType}`);
}
function parseReportNotificationStatus(status) {
    if (status === "queued") {
        return status;
    }
    throw new Error(`Unsupported report notification status: ${status}`);
}
function normalizeSavedReportTemplate(template) {
    return {
        columns: template.columns.map((column) => requireNonEmpty(column, "saved_report_template_column_required")),
        createdAt: requireNonEmpty(template.createdAt, "saved_report_template_created_at_required"),
        filters: clone(template.filters),
        id: requireNonEmpty(template.id, "saved_report_template_id_required"),
        name: requireNonEmpty(template.name, "saved_report_template_name_required"),
        ownerUserId: requireNonEmpty(template.ownerUserId, "saved_report_template_owner_required"),
        reportType: requireNonEmpty(template.reportType, "saved_report_template_report_type_required"),
        tenantId: requireNonEmpty(template.tenantId, "saved_report_template_tenant_id_required"),
        updatedAt: requireNonEmpty(template.updatedAt, "saved_report_template_updated_at_required"),
        visibility: normalizeSavedReportTemplateVisibility(template.visibility)
    };
}
function normalizeScheduledDigestDescriptor(descriptor) {
    const dueAt = requireIsoDate(descriptor.dueAt, "scheduled_digest_due_at_invalid");
    const createdAt = requireIsoDate(descriptor.createdAt, "scheduled_digest_created_at_invalid");
    const updatedAt = requireIsoDate(descriptor.updatedAt, "scheduled_digest_updated_at_invalid");
    return {
        createdAt,
        dueAt,
        id: requireNonEmpty(descriptor.id, "scheduled_digest_id_required"),
        periodKey: requireNonEmpty(descriptor.periodKey, "scheduled_digest_period_key_required"),
        reportType: requireNonEmpty(descriptor.reportType, "scheduled_digest_report_type_required"),
        scheduleId: requireNonEmpty(descriptor.scheduleId, "scheduled_digest_schedule_id_required"),
        status: parseScheduledDigestStatus(descriptor.status),
        tenantId: requireNonEmpty(descriptor.tenantId, "scheduled_digest_tenant_id_required"),
        updatedAt
    };
}
function isSavedReportTemplateInScope(template, filters) {
    return (!filters.tenantId || template.tenantId === filters.tenantId)
        && isSavedReportTemplateVisible(template, filters);
}
function normalizeSavedReportTemplateVisibility(visibility) {
    if (!visibility) {
        return { scope: "private" };
    }
    if (visibility.scope === "private") {
        return { scope: "private" };
    }
    if (visibility.scope === "roles") {
        return {
            roles: (visibility.roles ?? []).map((role) => requireNonEmpty(role, "saved_report_template_role_required")),
            scope: "roles"
        };
    }
    if (visibility.scope === "permissions") {
        return {
            permissions: (visibility.permissions ?? []).map((permission) => requireNonEmpty(permission, "saved_report_template_permission_required")),
            scope: "permissions"
        };
    }
    throw new Error(`Unsupported saved report template visibility scope: ${visibility.scope}`);
}
function isSavedReportTemplateVisible(template, filters) {
    if (!filters.requesterUserId && !filters.requesterRoles && !filters.requesterPermissions) {
        return true;
    }
    if (template.visibility.scope === "private") {
        return template.ownerUserId === filters.requesterUserId;
    }
    if (template.visibility.scope === "roles") {
        const requesterRoles = new Set(filters.requesterRoles ?? []);
        return (template.visibility.roles ?? []).some((role) => requesterRoles.has(role));
    }
    if (template.visibility.scope === "permissions") {
        const requesterPermissions = new Set(filters.requesterPermissions ?? []);
        return (template.visibility.permissions ?? []).some((permission) => requesterPermissions.has(permission));
    }
    return false;
}
function isScheduledDigestDescriptorInScope(descriptor, filters) {
    return (filters.tenantId === undefined || descriptor.tenantId === filters.tenantId)
        && (filters.status === undefined || descriptor.status === filters.status)
        && (filters.dueBefore === undefined || Date.parse(descriptor.dueAt) <= Date.parse(filters.dueBefore));
}
function isSameScheduledDigestPeriod(left, right) {
    return left.tenantId === right.tenantId
        && left.scheduleId === right.scheduleId
        && left.periodKey === right.periodKey;
}
function isDuplicateScheduledDigestPeriodReplay(existing, replay) {
    return existing.createdAt === replay.createdAt
        && existing.dueAt === replay.dueAt
        && existing.periodKey === replay.periodKey
        && existing.reportType === replay.reportType
        && existing.scheduleId === replay.scheduleId
        && existing.tenantId === replay.tenantId;
}
function compareScheduledDigestDescriptors(left, right) {
    const due = Date.parse(left.dueAt) - Date.parse(right.dueAt);
    if (due !== 0) {
        return due;
    }
    return left.id.localeCompare(right.id);
}
function parseScheduledDigestStatus(status) {
    if (status === "due" || status === "running" || status === "completed" || status === "failed") {
        return status;
    }
    throw new Error(`Unsupported scheduled digest status: ${status}`);
}
function normalizeFailureEnvelope(failureEnvelope) {
    return {
        code: requireNonEmpty(failureEnvelope.code, "report_query_failure_code_required"),
        message: requireNonEmpty(failureEnvelope.message, "report_query_failure_message_required")
    };
}
function parseReportQueryExecutionStatus(status) {
    if (status === "completed" || status === "failed" || status === "running") {
        return status;
    }
    throw new Error(`Unsupported report query execution status: ${status}`);
}
function metricTenantOverrideWhere(filters) {
    return {
        ...(filters.definitionId ? { definitionId: filters.definitionId } : {}),
        ...(filters.tenantId ? { tenantId: filters.tenantId } : {})
    };
}
function toPrismaMetricTenantOverrideCreateInput(override) {
    return {
        createdAt: new Date(override.createdAt),
        definitionId: override.definitionId,
        id: override.id,
        metricVersionId: override.metricVersionId,
        reason: override.reason,
        tenantId: override.tenantId,
        updatedAt: new Date(override.updatedAt)
    };
}
function toPrismaMetricTenantOverrideUpdateInput(create) {
    return {
        definitionId: create.definitionId,
        metricVersionId: create.metricVersionId,
        reason: create.reason,
        tenantId: create.tenantId,
        updatedAt: create.updatedAt
    };
}
function toMetricTenantOverrideRecord(row) {
    return {
        createdAt: row.createdAt.toISOString(),
        definitionId: row.definitionId,
        id: row.id,
        metricVersionId: row.metricVersionId,
        reason: row.reason,
        tenantId: row.tenantId,
        updatedAt: row.updatedAt.toISOString()
    };
}
function savedReportTemplateWhere(filters) {
    return {
        ...(filters.tenantId ? { tenantId: filters.tenantId } : {})
    };
}
function toPrismaReportIdempotencyKeyCreateInput(record) {
    return {
        fingerprint: record.fingerprint,
        jobId: record.jobId,
        key: record.key,
        tenantId: requireNonEmpty(record.tenantId, "report_idempotency_tenant_required")
    };
}
function toPrismaReportIdempotencyKeyUpdateInput(record) {
    return {
        fingerprint: record.fingerprint,
        jobId: record.jobId
    };
}
function toReportIdempotencyRecord(row) {
    return {
        fingerprint: row.fingerprint,
        jobId: row.jobId,
        key: row.key,
        tenantId: requireNonEmpty(row.tenantId, "report_idempotency_tenant_required")
    };
}
function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
function normalizeReportIdempotencyRecord(record) {
    return {
        ...clone(record),
        tenantId: requireNonEmpty(record.tenantId, "report_idempotency_tenant_required")
    };
}
function reportIdempotencyWhere(tenantId, key) {
    return {
        tenantId_key: {
            key,
            tenantId: requireNonEmpty(tenantId, "report_idempotency_tenant_required")
        }
    };
}
function toPrismaReportExportJobCreateInput(job) {
    return {
        auditId: job.auditId,
        backendQueueId: job.backendQueueId ?? null,
        columns: job.columns ?? [],
        createdAt: new Date(requireIsoDate(job.createdAt, "report_export_job_created_at_invalid")),
        deadLetteredAt: job.deadLetteredAt ? new Date(requireIsoDate(job.deadLetteredAt, "report_export_job_dead_lettered_at_invalid")) : null,
        failureCode: job.failureCode ?? null,
        failureMessage: job.failureMessage ?? null,
        fileName: job.fileName ?? null,
        filters: clone(job.filters ?? {}),
        format: job.format,
        id: job.id,
        metricDefinitionVersion: job.metricDefinitionVersion ?? null,
        name: job.name,
        period: job.period,
        progress: job.progress,
        queue: job.queue ?? null,
        requestedBy: job.requestedBy,
        rows: job.rows,
        status: job.status,
        statusKey: job.statusKey,
        tenantId: job.tenantId ?? reportExportJobTenantId(job)
    };
}
function toPrismaReportExportJobUpdateInput(create) {
    return {
        auditId: create.auditId,
        backendQueueId: create.backendQueueId,
        columns: create.columns,
        deadLetteredAt: create.deadLetteredAt,
        failureCode: create.failureCode,
        failureMessage: create.failureMessage,
        fileName: create.fileName,
        filters: create.filters,
        format: create.format,
        metricDefinitionVersion: create.metricDefinitionVersion,
        name: create.name,
        period: create.period,
        progress: create.progress,
        queue: create.queue,
        requestedBy: create.requestedBy,
        rows: create.rows,
        status: create.status,
        statusKey: create.statusKey,
        tenantId: create.tenantId
    };
}
function toReportExportJob(row) {
    return {
        auditId: row.auditId,
        ...(row.backendQueueId ? { backendQueueId: row.backendQueueId } : {}),
        columns: row.columns,
        createdAt: row.createdAt.toISOString(),
        ...(row.deadLetteredAt ? { deadLetteredAt: row.deadLetteredAt.toISOString() } : {}),
        ...(row.failureCode ? { failureCode: row.failureCode } : {}),
        ...(row.failureMessage ? { failureMessage: row.failureMessage } : {}),
        ...(row.fileName ? { fileName: row.fileName } : {}),
        filters: clone(row.filters),
        format: parseReportExportFormat(row.format),
        id: row.id,
        ...(row.metricDefinitionVersion ? { metricDefinitionVersion: row.metricDefinitionVersion } : {}),
        name: row.name,
        period: row.period,
        progress: row.progress,
        ...(row.queue ? { queue: row.queue } : {}),
        requestedBy: row.requestedBy,
        rows: row.rows,
        status: row.status,
        statusKey: parseReportExportStatusKey(row.statusKey),
        tenantId: row.tenantId
    };
}
function reportExportJobTenantId(job) {
    return requireNonEmpty(readReportExportJobTenantId(job) ?? "", "report_export_job_tenant_id_required");
}
function readReportExportJobTenantId(job) {
    return job.tenantId?.trim() || undefined;
}
function parseReportExportFormat(format) {
    if (format === "CSV" || format === "HTML" || format === "JSON" || format === "PDF" || format === "TXT" || format === "XLSX") {
        return format;
    }
    throw new Error(`Unsupported report export format: ${format}`);
}
function parseReportExportStatusKey(statusKey) {
    if (statusKey === "error" || statusKey === "expired" || statusKey === "queued" || statusKey === "ready" || statusKey === "running") {
        return statusKey;
    }
    throw new Error(`Unsupported report export status: ${statusKey}`);
}
function toPrismaSavedReportTemplateCreateInput(template) {
    return {
        columns: template.columns,
        createdAt: new Date(template.createdAt),
        filters: clone(template.filters),
        id: template.id,
        name: template.name,
        ownerUserId: template.ownerUserId,
        reportType: template.reportType,
        tenantId: template.tenantId,
        updatedAt: new Date(template.updatedAt),
        visibilityPermissions: template.visibility.permissions ?? [],
        visibilityRoles: template.visibility.roles ?? [],
        visibilityScope: template.visibility.scope
    };
}
function toPrismaSavedReportTemplateUpdateInput(create) {
    return {
        columns: create.columns,
        filters: create.filters,
        name: create.name,
        ownerUserId: create.ownerUserId,
        reportType: create.reportType,
        tenantId: create.tenantId,
        updatedAt: create.updatedAt,
        visibilityPermissions: create.visibilityPermissions,
        visibilityRoles: create.visibilityRoles,
        visibilityScope: create.visibilityScope
    };
}
function toSavedReportTemplateRecord(row) {
    return {
        columns: row.columns,
        createdAt: row.createdAt.toISOString(),
        filters: clone(row.filters),
        id: row.id,
        name: row.name,
        ownerUserId: row.ownerUserId,
        reportType: row.reportType,
        tenantId: row.tenantId,
        updatedAt: row.updatedAt.toISOString(),
        visibility: normalizeSavedReportTemplateVisibility({
            permissions: row.visibilityPermissions,
            roles: row.visibilityRoles,
            scope: row.visibilityScope
        })
    };
}
function toPrismaReportQueryExecutionCreateInput(execution) {
    const now = new Date();
    return {
        createdAt: now,
        failureCode: execution.failureEnvelope?.code ?? null,
        failureMessage: execution.failureEnvelope?.message ?? null,
        id: execution.id,
        metricKey: execution.metricKey,
        parameters: execution.parameters ? clone(execution.parameters) : null,
        status: execution.status,
        updatedAt: now
    };
}
function toPrismaReportQueryExecutionUpdateInput(create) {
    return {
        failureCode: create.failureCode,
        failureMessage: create.failureMessage,
        metricKey: create.metricKey,
        parameters: create.parameters,
        status: create.status,
        updatedAt: create.updatedAt
    };
}
function toReportQueryExecutionRecord(row) {
    return normalizeReportQueryExecution({
        ...(row.failureCode && row.failureMessage ? { failureEnvelope: { code: row.failureCode, message: row.failureMessage } } : {}),
        id: row.id,
        metricKey: row.metricKey,
        ...(row.parameters ? { parameters: clone(row.parameters) } : {}),
        status: parseReportQueryExecutionStatus(row.status)
    });
}
function toPrismaReportFileDescriptorCreateInput(descriptor) {
    const createdAt = new Date(requireIsoDate(descriptor.createdAt, "report_file_descriptor_created_at_invalid"));
    return {
        checksum: descriptor.checksum,
        contentType: descriptor.contentType,
        createdAt,
        fileName: descriptor.fileName,
        format: descriptor.format,
        id: descriptor.id,
        jobId: descriptor.jobId,
        metricDefinitionVersion: descriptor.metricDefinitionVersion,
        objectKey: descriptor.objectKey,
        sizeBytes: descriptor.sizeBytes,
        tenantId: descriptor.tenantId,
        updatedAt: createdAt,
        writtenAt: new Date(requireIsoDate(descriptor.writtenAt, "report_file_descriptor_written_at_invalid"))
    };
}
function toPrismaReportFileDescriptorUpdateInput(create) {
    return {
        checksum: create.checksum,
        contentType: create.contentType,
        fileName: create.fileName,
        format: create.format,
        jobId: create.jobId,
        metricDefinitionVersion: create.metricDefinitionVersion,
        objectKey: create.objectKey,
        sizeBytes: create.sizeBytes,
        tenantId: create.tenantId,
        updatedAt: create.updatedAt,
        writtenAt: create.writtenAt
    };
}
function toReportFileDescriptorRecord(row) {
    return normalizeReportFileDescriptor({
        checksum: row.checksum,
        contentType: row.contentType,
        createdAt: row.createdAt.toISOString(),
        fileName: row.fileName,
        format: row.format,
        id: row.id,
        jobId: row.jobId,
        metricDefinitionVersion: row.metricDefinitionVersion,
        objectKey: row.objectKey,
        sizeBytes: row.sizeBytes,
        tenantId: row.tenantId,
        writtenAt: row.writtenAt.toISOString()
    });
}
function toPrismaReportNotificationDescriptorCreateInput(descriptor) {
    const createdAt = new Date(descriptor.createdAt);
    return {
        createdAt,
        eventType: descriptor.eventType,
        exportJobId: descriptor.exportJobId,
        id: descriptor.id,
        idempotencyKey: descriptor.idempotencyKey,
        payload: clone(descriptor.payload),
        status: descriptor.status,
        tenantId: descriptor.tenantId,
        updatedAt: createdAt
    };
}
function toPrismaReportNotificationDescriptorUpdateInput(create) {
    return {
        eventType: create.eventType,
        exportJobId: create.exportJobId,
        idempotencyKey: create.idempotencyKey,
        payload: create.payload,
        status: create.status,
        tenantId: create.tenantId,
        updatedAt: create.updatedAt
    };
}
function toReportNotificationDescriptorRecord(row) {
    return normalizeReportNotificationDescriptor({
        createdAt: row.createdAt.toISOString(),
        eventType: parseReportNotificationEventType(row.eventType),
        exportJobId: row.exportJobId,
        id: row.id,
        idempotencyKey: row.idempotencyKey,
        payload: clone(row.payload),
        status: parseReportNotificationStatus(row.status),
        tenantId: row.tenantId
    });
}
function hasScheduledDigestDescriptorWhere(filters) {
    return Boolean(filters.dueBefore || filters.status || filters.tenantId);
}
function scheduledDigestDescriptorWhere(filters) {
    return {
        ...(filters.dueBefore ? { dueAt: { lte: new Date(requireIsoDate(filters.dueBefore, "scheduled_digest_due_before_invalid")) } } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.tenantId ? { tenantId: filters.tenantId } : {})
    };
}
function toPrismaScheduledDigestDescriptorCreateInput(descriptor) {
    return {
        createdAt: new Date(descriptor.createdAt),
        dueAt: new Date(descriptor.dueAt),
        id: descriptor.id,
        periodKey: descriptor.periodKey,
        reportType: descriptor.reportType,
        scheduleId: descriptor.scheduleId,
        status: descriptor.status,
        tenantId: descriptor.tenantId,
        updatedAt: new Date(descriptor.updatedAt)
    };
}
function toPrismaScheduledDigestDescriptorUpdateInput(create) {
    return {
        dueAt: create.dueAt,
        periodKey: create.periodKey,
        reportType: create.reportType,
        scheduleId: create.scheduleId,
        status: create.status,
        tenantId: create.tenantId,
        updatedAt: create.updatedAt
    };
}
function toScheduledDigestDescriptorRecord(row) {
    return normalizeScheduledDigestDescriptor({
        createdAt: row.createdAt.toISOString(),
        dueAt: row.dueAt.toISOString(),
        id: row.id,
        periodKey: row.periodKey,
        reportType: row.reportType,
        scheduleId: row.scheduleId,
        status: parseScheduledDigestStatus(row.status),
        tenantId: row.tenantId,
        updatedAt: row.updatedAt.toISOString()
    });
}
function toPrismaReportExportRetryAuditEventCreateInput(auditEvent) {
    return {
        action: auditEvent.action,
        at: new Date(requireIsoDate(auditEvent.at, "report_export_retry_audit_at_invalid")),
        auditId: auditEvent.auditId,
        backendQueueId: auditEvent.backendQueueId,
        createdAt: new Date(requireIsoDate(auditEvent.at, "report_export_retry_audit_at_invalid")),
        format: auditEvent.format,
        immutable: auditEvent.immutable,
        jobId: auditEvent.jobId,
        metricDefinitionVersion: auditEvent.metricDefinitionVersion,
        nextStatusKey: auditEvent.nextStatusKey,
        previousStatusKey: auditEvent.previousStatusKey,
        queue: auditEvent.queue,
        reasonCode: auditEvent.reasonCode
    };
}
function toPrismaReportExportRetryAuditEventUpdateInput(create) {
    return {
        action: create.action,
        at: create.at,
        backendQueueId: create.backendQueueId,
        format: create.format,
        immutable: create.immutable,
        jobId: create.jobId,
        metricDefinitionVersion: create.metricDefinitionVersion,
        nextStatusKey: create.nextStatusKey,
        previousStatusKey: create.previousStatusKey,
        queue: create.queue,
        reasonCode: create.reasonCode
    };
}
function toExportRetryAuditEvent(row) {
    if (row.action !== "report.export.retry") {
        throw new Error(`Unsupported report export retry audit action: ${row.action}`);
    }
    if (!row.immutable) {
        throw new Error("report_export_retry_audit_mutable");
    }
    if (row.reasonCode !== "operator_requested") {
        throw new Error(`Unsupported report export retry reason: ${row.reasonCode}`);
    }
    return {
        action: "report.export.retry",
        at: row.at.toISOString(),
        auditId: row.auditId,
        backendQueueId: row.backendQueueId,
        format: row.format,
        immutable: true,
        jobId: row.jobId,
        metricDefinitionVersion: row.metricDefinitionVersion,
        nextStatusKey: row.nextStatusKey,
        previousStatusKey: row.previousStatusKey,
        queue: row.queue,
        reasonCode: "operator_requested"
    };
}
function clone(value) {
    if (value === undefined) {
        return value;
    }
    return JSON.parse(JSON.stringify(value));
}
function isPromiseLike(value) {
    return Boolean(value && typeof value.then === "function");
}
function normalizeClaimLimit(value) {
    const normalized = value ?? 50;
    if (!Number.isInteger(normalized) || normalized <= 0) {
        throw new Error("report_export_claim_limit_invalid");
    }
    return normalized;
}
function normalizeClaimLeaseMs(value) {
    const normalized = value ?? 15 * 60_000;
    if (!Number.isInteger(normalized) || normalized <= 0) {
        throw new Error("report_export_claim_lease_invalid");
    }
    return normalized;
}
function normalizeScheduledDigestClaimInput(input) {
    const limit = input.limit ?? Number.MAX_SAFE_INTEGER;
    if (!Number.isInteger(limit) || limit < 0) {
        throw new Error("scheduled_digest_claim_limit_invalid");
    }
    const leaseMs = input.leaseMs ?? 15 * 60_000;
    if (!Number.isInteger(leaseMs) || leaseMs <= 0) {
        throw new Error("scheduled_digest_claim_lease_invalid");
    }
    if (!(input.now instanceof Date) || !Number.isFinite(input.now.getTime())) {
        throw new Error("scheduled_digest_claim_now_invalid");
    }
    return {
        limit,
        now: input.now,
        nowIso: input.now.toISOString(),
        staleBefore: new Date(input.now.getTime() - leaseMs).toISOString()
    };
}
function normalizeExportQueue(value) {
    return value?.trim() || "report-export";
}
function requireNonEmpty(value, errorCode) {
    const trimmed = value.trim();
    if (!trimmed) {
        throw new Error(errorCode);
    }
    return trimmed;
}
function requireIsoDate(value, errorCode) {
    const trimmed = requireNonEmpty(value, errorCode);
    const parsed = new Date(trimmed);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== trimmed) {
        throw new Error(errorCode);
    }
    return trimmed;
}
function isUniqueConstraintError(error) {
    return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}
//# sourceMappingURL=report.repository.js.map