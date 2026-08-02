import { InMemoryStore } from "@support-communication/database";
export class TemplateOwnershipConflictError extends Error {
    code = "template_tenant_mismatch";
    constructor(templateId) {
        super(`Template ${templateId} belongs to another tenant.`);
        this.name = "TemplateOwnershipConflictError";
    }
}
let defaultRepository = null;
export class WorkspaceRepository {
    adapter;
    constructor(adapter) {
        this.adapter = adapter;
    }
    static default() {
        defaultRepository ??= WorkspaceRepository.inMemory();
        return defaultRepository;
    }
    static useDefault(repository) {
        defaultRepository = repository;
    }
    static inMemory(seed = createEmptyWorkspaceState()) {
        return new WorkspaceRepository(createDurableWorkspaceRepository(new InMemoryStore(seed)));
    }
    static prisma({ client, fallback }) {
        return new WorkspaceRepository(new PrismaWorkspaceRepository(client, fallback));
    }
    completeFileScanResultIdempotency(key, result) {
        return this.adapter.completeFileScanResultIdempotency(key, result);
    }
    findFileScanResultIdempotency(key, scope = {}) {
        return this.adapter.findFileScanResultIdempotency(key, scope);
    }
    findFile(fileId, scope = {}) {
        return this.adapter.findFile(fileId, scope);
    }
    listFiles(scope = {}) {
        return this.adapter.listFiles(scope);
    }
    findClientProfile(sourceProfileId, scope = {}) {
        return this.adapter.findClientProfile(sourceProfileId, scope);
    }
    findKnowledgeApprovalDecision(articleId, decisionId, scope = {}) {
        return this.adapter.findKnowledgeApprovalDecision(articleId, decisionId, scope);
    }
    findKnowledgeArticle(articleId, scope = {}) {
        return this.adapter.findKnowledgeArticle(articleId, scope);
    }
    findKnowledgeDraftVersion(articleId, draftId, scope = {}) {
        return this.adapter.findKnowledgeDraftVersion(articleId, draftId, scope);
    }
    findTemplate(templateId, scope = {}) {
        return this.adapter.findTemplate(templateId, scope);
    }
    findTemplateAuditEvent(auditId) {
        return this.adapter.findTemplateAuditEvent(auditId);
    }
    findTemplateVersion(templateId, version) {
        return this.adapter.findTemplateVersion(templateId, version);
    }
    listClientMergeConflicts(filters = {}) {
        return this.adapter.listClientMergeConflicts(filters);
    }
    listClientMergeEvents(filters = {}) {
        return this.adapter.listClientMergeEvents(filters);
    }
    listClientExportJobs(scope = {}) {
        return this.adapter.listClientExportJobs(scope);
    }
    listClientProfiles(scope = {}) {
        return this.adapter.listClientProfiles(scope);
    }
    listKnowledgeApprovalDecisions(articleId, scope = {}) {
        return this.adapter.listKnowledgeApprovalDecisions(articleId, scope);
    }
    listKnowledgeArticles(scope = {}) {
        return this.adapter.listKnowledgeArticles(scope);
    }
    listKnowledgeDraftVersions(articleId, scope = {}) {
        return this.adapter.listKnowledgeDraftVersions(articleId, scope);
    }
    listTemplateAuditEvents(templateId) {
        return this.adapter.listTemplateAuditEvents(templateId);
    }
    listTemplates(scope = {}) {
        return this.adapter.listTemplates(scope);
    }
    listTemplateVersions(templateId) {
        return this.adapter.listTemplateVersions(templateId);
    }
    saveClientMergeEvent(event) {
        return this.adapter.saveClientMergeEvent(event);
    }
    saveClientMergeConflict(conflict) {
        return this.adapter.saveClientMergeConflict(conflict);
    }
    saveClientExportJob(job) {
        return this.adapter.saveClientExportJob(job);
    }
    saveClientProfile(profile) {
        return this.adapter.saveClientProfile(profile);
    }
    saveFileScanResultIdempotency(record) {
        return this.adapter.saveFileScanResultIdempotency(record);
    }
    saveFile(file) {
        return this.adapter.saveFile(file);
    }
    saveKnowledgeApprovalDecision(decision) {
        return this.adapter.saveKnowledgeApprovalDecision(decision);
    }
    saveKnowledgeArticle(article) {
        return this.adapter.saveKnowledgeArticle({ ...article, tenantId: requireWorkspaceTenantId(article.tenantId) });
    }
    saveKnowledgeDraftVersion(version) {
        return this.adapter.saveKnowledgeDraftVersion(version);
    }
    saveTemplateAuditEvent(event) {
        return this.adapter.saveTemplateAuditEvent(event);
    }
    saveTemplate(template) {
        return this.adapter.saveTemplate({ ...template, tenantId: requireWorkspaceTenantId(template.tenantId) });
    }
    saveTemplateVersion(version) {
        return this.adapter.saveTemplateVersion(version);
    }
    updateFileScanResult(fileId, scanResult) {
        return this.adapter.updateFileScanResult(fileId, scanResult);
    }
    updateClientMergeConflictState(conflictId, state) {
        return this.adapter.updateClientMergeConflictState(conflictId, state);
    }
    updateKnowledgeArticlePublicationState(articleId, state) {
        return this.adapter.updateKnowledgeArticlePublicationState(articleId, state);
    }
    updateKnowledgeDraftVersionState(articleId, draftId, state) {
        return this.adapter.updateKnowledgeDraftVersionState(articleId, draftId, state);
    }
}
class PrismaWorkspaceRepository {
    client;
    constructor(client, _fallback) {
        this.client = client;
    }
    async completeFileScanResultIdempotency(key, result) {
        try {
            const row = await this.client.workspaceFileScanResultIdempotency.update({
                data: { result: clone(result) },
                where: { key }
            });
            return toFileScanResultIdempotencyRecord(row);
        }
        catch (error) {
            if (isPrismaNotFoundError(error)) {
                return undefined;
            }
            throw error;
        }
    }
    async findFileScanResultIdempotency(key, scope = {}) {
        const row = await this.client.workspaceFileScanResultIdempotency.findUnique({ where: { key } });
        if (!row) {
            return undefined;
        }
        const record = toFileScanResultIdempotencyRecord(row);
        if (scope.tenantId) {
            const file = await this.findFile(record.fileId, scope);
            if (!file) {
                return undefined;
            }
            return { ...record, tenantId: file.tenantId };
        }
        return record;
    }
    async findFile(fileId, scope = {}) {
        const row = await this.client.workspaceFile.findUnique({ where: { fileId } });
        if (!row) {
            return undefined;
        }
        const file = toFileRecord(row);
        return scope.tenantId && file.tenantId !== scope.tenantId ? undefined : file;
    }
    async listFiles(scope = {}) {
        const rows = await this.client.workspaceFile.findMany({
            ...(scope.tenantId ? { where: { tenantId: scope.tenantId } } : {})
        });
        return rows.map(toFileRecord);
    }
    async findClientProfile(sourceProfileId, scope = {}) {
        if (!scope.tenantId) {
            return undefined;
        }
        const row = await this.client.clientProfile.findFirst({
            where: {
                sourceProfileId,
                tenantId: scope.tenantId
            }
        });
        return row ? toClientProfileRecord(row) : undefined;
    }
    async findKnowledgeArticle(articleId, scope = {}) {
        const row = await this.client.knowledgeArticle.findUnique({ where: { id: articleId } });
        return row && (!scope.tenantId || row.tenantId === scope.tenantId) ? toKnowledgeArticle(row) : undefined;
    }
    async findKnowledgeApprovalDecision(articleId, decisionId, scope = {}) {
        if (scope.tenantId && !await this.findKnowledgeArticle(articleId, scope)) {
            return undefined;
        }
        const row = await this.client.knowledgeApprovalDecision.findFirst({
            where: { articleId, id: decisionId }
        });
        return row ? toKnowledgeApprovalDecisionRecord(row) : undefined;
    }
    async findKnowledgeDraftVersion(articleId, draftId, scope = {}) {
        if (scope.tenantId && !await this.findKnowledgeArticle(articleId, scope)) {
            return undefined;
        }
        const row = await this.client.knowledgeDraftVersion.findFirst({
            where: { articleId, id: draftId }
        });
        return row ? toKnowledgeDraftVersionRecord(row) : undefined;
    }
    async findTemplate(templateId, scope = {}) {
        const row = await this.client.templateRecord.findUnique({ where: { id: templateId } });
        return row && (!scope.tenantId || row.tenantId === scope.tenantId) ? toTemplateRecord(row) : undefined;
    }
    async findTemplateAuditEvent(auditId) {
        const row = await this.client.templateAuditEvent.findUnique({ where: { id: auditId } });
        return row ? toTemplateAuditRecord(row) : undefined;
    }
    async findTemplateVersion(templateId, version) {
        const row = await this.client.templateVersion.findFirst({
            where: { templateId, version }
        });
        return row ? toTemplateVersionRecord(row) : undefined;
    }
    async listClientMergeConflicts(filters = {}) {
        const rows = await this.client.clientMergeConflict.findMany({
            orderBy: { createdAt: "asc" },
            where: clientMergeConflictWhere(filters)
        });
        return rows.map(toClientMergeConflictRecord);
    }
    async listClientMergeEvents(filters = {}) {
        const rows = await this.client.clientMergeEvent.findMany({
            orderBy: { createdAt: "asc" },
            where: clientMergeEventWhere(filters)
        });
        return rows.map(toClientMergeEvent);
    }
    async listClientExportJobs(scope = {}) {
        const rows = await this.client.clientExportJob.findMany({
            orderBy: { createdAt: "desc" },
            where: scope.tenantId ? { tenantId: scope.tenantId } : undefined
        });
        return rows.map(toClientExportJobRecord);
    }
    async listClientProfiles(scope = {}) {
        const rows = await this.client.clientProfile.findMany({
            orderBy: { updatedAt: "desc" },
            where: scope.tenantId ? { tenantId: scope.tenantId } : undefined
        });
        return rows.map(toClientProfileRecord);
    }
    async listKnowledgeArticles(scope = {}) {
        const rows = await this.client.knowledgeArticle.findMany({
            orderBy: { updatedAt: "desc" },
            ...(scope.tenantId ? { where: { tenantId: scope.tenantId } } : {})
        });
        return rows.map(toKnowledgeArticle);
    }
    async listKnowledgeApprovalDecisions(articleId, scope = {}) {
        if (scope.tenantId && !await this.findKnowledgeArticle(articleId, scope)) {
            return [];
        }
        const rows = await this.client.knowledgeApprovalDecision.findMany({
            orderBy: { timestamp: "asc" },
            where: { articleId }
        });
        return rows.map(toKnowledgeApprovalDecisionRecord);
    }
    async listKnowledgeDraftVersions(articleId, scope = {}) {
        if (scope.tenantId && !await this.findKnowledgeArticle(articleId, scope)) {
            return [];
        }
        const rows = await this.client.knowledgeDraftVersion.findMany({
            orderBy: { updatedAt: "asc" },
            where: { articleId }
        });
        return rows.map(toKnowledgeDraftVersionRecord);
    }
    async listTemplateAuditEvents(templateId) {
        const rows = await this.client.templateAuditEvent.findMany({
            orderBy: { timestamp: "asc" },
            where: { templateId }
        });
        return rows.map(toTemplateAuditRecord);
    }
    async listTemplates(scope = {}) {
        const rows = await this.client.templateRecord.findMany({
            orderBy: { updatedAt: "desc" },
            ...(scope.tenantId ? { where: { tenantId: scope.tenantId } } : {})
        });
        return rows.map(toTemplateRecord);
    }
    async listTemplateVersions(templateId) {
        const rows = await this.client.templateVersion.findMany({
            orderBy: { version: "asc" },
            where: { templateId }
        });
        return rows.map(toTemplateVersionRecord);
    }
    async saveClientMergeEvent(event) {
        const create = toPrismaClientMergeEventCreateInput(event);
        const existingById = await this.client.clientMergeEvent.findUnique({ where: { id: event.id } });
        const idReplay = existingById ? resolveClientMergeEventReplay([toClientMergeEvent(existingById)], event) : undefined;
        if (idReplay) {
            return idReplay;
        }
        const edgeRows = await this.client.clientMergeEvent.findMany({
            orderBy: { createdAt: "asc" },
            where: { tenantId: create.tenantId }
        });
        const edgeReplay = resolveClientMergeEventReplay(edgeRows.map(toClientMergeEvent), event);
        if (edgeReplay) {
            return edgeReplay;
        }
        let row;
        try {
            row = await this.client.clientMergeEvent.upsert({
                create,
                update: toPrismaClientMergeEventUpdateInput(create),
                where: { id: event.id }
            });
        }
        catch (error) {
            if (!isUniqueConstraintError(error)) {
                throw error;
            }
            const racedById = await this.client.clientMergeEvent.findUnique({ where: { id: event.id } });
            const racedEdgeRows = await this.client.clientMergeEvent.findMany({
                orderBy: { createdAt: "asc" },
                where: { tenantId: create.tenantId }
            });
            const replay = resolveClientMergeEventReplay([
                ...(racedById ? [toClientMergeEvent(racedById)] : []),
                ...racedEdgeRows.filter((item) => item.id !== racedById?.id).map(toClientMergeEvent)
            ], event);
            if (replay) {
                return replay;
            }
            throw error;
        }
        return toClientMergeEvent(row);
    }
    async saveClientMergeConflict(conflict) {
        const create = toPrismaClientMergeConflictCreateInput(conflict);
        const row = await this.client.clientMergeConflict.upsert({
            create,
            update: toPrismaClientMergeConflictUpsertUpdateInput(create),
            where: { id: conflict.id }
        });
        return toClientMergeConflictRecord(row);
    }
    async saveClientExportJob(job) {
        const create = toPrismaClientExportJobCreateInput(job);
        const row = await this.client.clientExportJob.upsert({
            create,
            update: toPrismaClientExportJobUpdateInput(create),
            where: { exportId: create.exportId }
        });
        return toClientExportJobRecord(row);
    }
    async saveClientProfile(profile) {
        const create = toPrismaClientProfileCreateInput(profile);
        const row = await this.client.clientProfile.upsert({
            create,
            update: toPrismaClientProfileUpdateInput(create),
            where: {
                tenantId_sourceProfileId: {
                    sourceProfileId: create.sourceProfileId,
                    tenantId: create.tenantId
                }
            }
        });
        return toClientProfileRecord(row);
    }
    async saveFileScanResultIdempotency(record) {
        try {
            const row = await this.client.workspaceFileScanResultIdempotency.create({
                data: {
                    fileId: record.fileId,
                    fingerprint: record.fingerprint,
                    key: record.key,
                    result: clone(record.result)
                }
            });
            return toFileScanResultIdempotencyRecord(row);
        }
        catch (error) {
            if (isUniqueConstraintError(error)) {
                const existing = await this.findFileScanResultIdempotency(record.key);
                if (existing) {
                    return existing;
                }
            }
            throw error;
        }
    }
    async saveFile(file) {
        const create = toPrismaWorkspaceFileCreateInput(file);
        const row = await this.client.workspaceFile.upsert({
            create,
            update: toPrismaWorkspaceFileUpdateInput(create),
            where: { fileId: file.fileId }
        });
        return toFileRecord(row);
    }
    async saveKnowledgeArticle(article) {
        const create = toPrismaKnowledgeArticleCreateInput(article);
        const row = await this.client.knowledgeArticle.upsert({
            create,
            update: toPrismaKnowledgeArticleUpdateInput(create),
            where: { id: article.id }
        });
        return toKnowledgeArticle(row);
    }
    async saveKnowledgeApprovalDecision(decision) {
        const create = toPrismaKnowledgeApprovalDecisionCreateInput(decision);
        const existing = await this.client.knowledgeApprovalDecision.findFirst({
            where: { articleId: decision.articleId, id: decision.id }
        });
        if (existing) {
            const existingDecision = toKnowledgeApprovalDecisionRecord(existing);
            if (isDuplicateKnowledgeApprovalDecisionReplay(existingDecision, decision)) {
                return existingDecision;
            }
            throw new Error(`Knowledge approval decision ${decision.id} conflicts with existing immutable decision.`);
        }
        const row = await this.client.knowledgeApprovalDecision.upsert({
            create,
            update: toPrismaKnowledgeApprovalDecisionUpdateInput(create),
            where: { id: decision.id }
        });
        return toKnowledgeApprovalDecisionRecord(row);
    }
    async saveKnowledgeDraftVersion(version) {
        const create = toPrismaKnowledgeDraftVersionCreateInput(version);
        const existing = await this.client.knowledgeDraftVersion.findUnique({ where: { id: version.id } });
        if (existing) {
            const existingVersion = toKnowledgeDraftVersionRecord(existing);
            if (isDuplicateKnowledgeDraftVersionReplay(existingVersion, version)) {
                return existingVersion;
            }
            throw new Error(`Knowledge draft version ${version.id} conflicts with existing draft decision.`);
        }
        const row = await this.client.knowledgeDraftVersion.upsert({
            create,
            update: toPrismaKnowledgeDraftVersionUpdateInput(create),
            where: { id: version.id }
        });
        return toKnowledgeDraftVersionRecord(row);
    }
    async saveTemplateAuditEvent(event) {
        const create = toPrismaTemplateAuditEventCreateInput(event);
        const row = await this.client.templateAuditEvent.upsert({
            create,
            update: toPrismaTemplateAuditEventUpdateInput(create),
            where: { id: event.id }
        });
        return toTemplateAuditRecord(row);
    }
    async saveTemplate(template) {
        const create = toPrismaTemplateRecordCreateInput(template);
        const existing = await this.client.templateRecord.findUnique({ where: { id: template.id } });
        if (existing) {
            return this.updateOwnedTemplate(existing, create);
        }
        try {
            return toTemplateRecord(await this.client.templateRecord.create({ data: create }));
        }
        catch (error) {
            if (!isUniqueConstraintError(error)) {
                throw error;
            }
            const raced = await this.client.templateRecord.findUnique({ where: { id: template.id } });
            if (!raced) {
                throw error;
            }
            return this.updateOwnedTemplate(raced, create);
        }
    }
    async updateOwnedTemplate(existing, create) {
        if (existing.tenantId !== create.tenantId) {
            throw new TemplateOwnershipConflictError(create.id);
        }
        const updated = await this.client.templateRecord.updateMany({
            data: toPrismaTemplateRecordUpdateInput(create),
            where: { id: create.id, tenantId: create.tenantId }
        });
        if (updated.count !== 1) {
            throw new TemplateOwnershipConflictError(create.id);
        }
        const row = await this.client.templateRecord.findUnique({ where: { id: create.id } });
        if (!row || row.tenantId !== create.tenantId) {
            throw new TemplateOwnershipConflictError(create.id);
        }
        return toTemplateRecord(row);
    }
    async saveTemplateVersion(version) {
        const create = toPrismaTemplateVersionCreateInput(version);
        const row = await this.client.templateVersion.upsert({
            create,
            update: toPrismaTemplateVersionUpdateInput(create),
            where: { id: version.id }
        });
        return toTemplateVersionRecord(row);
    }
    async updateFileScanResult(fileId, scanResult) {
        try {
            const row = await this.client.workspaceFile.update({
                data: toPrismaWorkspaceFileScanUpdateInput(scanResult),
                where: { fileId }
            });
            return toFileRecord(row);
        }
        catch (error) {
            if (isPrismaNotFoundError(error)) {
                return undefined;
            }
            throw error;
        }
    }
    async updateClientMergeConflictState(conflictId, state) {
        const nextState = parseClientMergeConflictState(state);
        try {
            const row = await this.client.clientMergeConflict.update({
                data: { state: nextState },
                where: { id: conflictId }
            });
            return toClientMergeConflictRecord(row);
        }
        catch (error) {
            if (isPrismaNotFoundError(error)) {
                return undefined;
            }
            throw error;
        }
    }
    async updateKnowledgeArticlePublicationState(articleId, state) {
        try {
            const row = await this.client.knowledgeArticle.update({
                data: {
                    status: state.status,
                    updatedAt: new Date(state.updated),
                    visibility: state.visibility
                },
                where: { id: articleId }
            });
            return toKnowledgeArticle(row);
        }
        catch (error) {
            if (isPrismaNotFoundError(error)) {
                return undefined;
            }
            throw error;
        }
    }
    async updateKnowledgeDraftVersionState(_articleId, draftId, state) {
        try {
            const row = await this.client.knowledgeDraftVersion.update({
                data: {
                    status: state.status,
                    updatedAt: new Date(state.updated)
                },
                where: { id: draftId }
            });
            return toKnowledgeDraftVersionRecord(row);
        }
        catch (error) {
            if (isPrismaNotFoundError(error)) {
                return undefined;
            }
            throw error;
        }
    }
}
function createDurableWorkspaceRepository(store) {
    return {
        completeFileScanResultIdempotency(key, result) {
            let persisted;
            store.update((state) => {
                const current = normalizeState(state);
                const existing = current.fileScanResultIdempotency.find((record) => record.key === key);
                if (!existing) {
                    persisted = undefined;
                    return current;
                }
                const nextRecord = {
                    ...existing,
                    result: clone(result)
                };
                persisted = nextRecord;
                return {
                    ...current,
                    fileScanResultIdempotency: current.fileScanResultIdempotency.map((record) => record.key === key ? nextRecord : record)
                };
            });
            return clone(persisted);
        },
        findFileScanResultIdempotency(key, scope = {}) {
            const state = readState(store);
            const record = state.fileScanResultIdempotency.find((item) => item.key === key);
            if (!record) {
                return undefined;
            }
            const file = state.files.find((item) => item.fileId === record.fileId);
            if (scope.tenantId && file?.tenantId !== scope.tenantId) {
                return undefined;
            }
            return clone({
                ...record,
                ...(file?.tenantId ? { tenantId: file.tenantId } : {})
            });
        },
        findFile(fileId, scope = {}) {
            const file = readState(store).files.find((item) => item.fileId === fileId);
            return !file || scope.tenantId && file.tenantId !== scope.tenantId ? undefined : clone(file);
        },
        listFiles(scope = {}) {
            return clone(readState(store).files.filter((file) => !scope.tenantId || file.tenantId === scope.tenantId));
        },
        findClientProfile(sourceProfileId, scope = {}) {
            if (!scope.tenantId) {
                return undefined;
            }
            return clone(readState(store).clientProfiles.find((profile) => profile.sourceProfileId === sourceProfileId && isClientProfileInScope(profile, scope)));
        },
        findKnowledgeArticle(articleId, scope = {}) {
            return clone(readState(store).knowledgeArticles.find((article) => article.id === articleId && isKnowledgeArticleInScope(article, scope)));
        },
        findKnowledgeApprovalDecision(articleId, decisionId, scope = {}) {
            const current = readState(store);
            if (scope.tenantId && !current.knowledgeArticles.some((article) => article.id === articleId && isKnowledgeArticleInScope(article, scope))) {
                return undefined;
            }
            return clone(readState(store).knowledgeApprovalDecisions.find((decision) => decision.articleId === articleId && decision.id === decisionId));
        },
        findKnowledgeDraftVersion(articleId, draftId, scope = {}) {
            const current = readState(store);
            if (scope.tenantId && !current.knowledgeArticles.some((article) => article.id === articleId && isKnowledgeArticleInScope(article, scope))) {
                return undefined;
            }
            return clone(readState(store).knowledgeDraftVersions.find((version) => version.articleId === articleId && version.id === draftId));
        },
        findTemplate(templateId, scope = {}) {
            return clone(readState(store).templates.find((template) => template.id === templateId && isTemplateInScope(template, scope)));
        },
        findTemplateAuditEvent(auditId) {
            return clone(readState(store).templateAuditEvents.find((event) => event.id === auditId));
        },
        findTemplateVersion(templateId, version) {
            return clone(readState(store).templateVersions.find((item) => item.templateId === templateId && item.version === version));
        },
        listClientMergeConflicts(filters = {}) {
            return clone(readState(store).clientMergeConflicts.filter((conflict) => isClientMergeConflictInScope(conflict, filters)));
        },
        listClientMergeEvents(filters = {}) {
            return clone(readState(store).clientMergeEvents.filter((event) => isClientMergeEventInScope(event, filters)));
        },
        listClientExportJobs(scope = {}) {
            return clone(readState(store).clientExportJobs.filter((job) => !scope.tenantId || job.tenantId === scope.tenantId));
        },
        listClientProfiles(scope = {}) {
            return clone(readState(store).clientProfiles.filter((profile) => isClientProfileInScope(profile, scope)));
        },
        listKnowledgeArticles(scope = {}) {
            return clone(readState(store).knowledgeArticles.filter((article) => isKnowledgeArticleInScope(article, scope)));
        },
        listKnowledgeApprovalDecisions(articleId, scope = {}) {
            const current = readState(store);
            if (scope.tenantId && !current.knowledgeArticles.some((article) => article.id === articleId && isKnowledgeArticleInScope(article, scope))) {
                return [];
            }
            return clone(current.knowledgeApprovalDecisions.filter((decision) => decision.articleId === articleId));
        },
        listKnowledgeDraftVersions(articleId, scope = {}) {
            const current = readState(store);
            if (scope.tenantId && !current.knowledgeArticles.some((article) => article.id === articleId && isKnowledgeArticleInScope(article, scope))) {
                return [];
            }
            return clone(current.knowledgeDraftVersions.filter((version) => version.articleId === articleId));
        },
        listTemplates(scope = {}) {
            return clone(readState(store).templates.filter((template) => isTemplateInScope(template, scope)));
        },
        listTemplateAuditEvents(templateId) {
            return clone(readState(store).templateAuditEvents.filter((event) => event.templateId === templateId));
        },
        listTemplateVersions(templateId) {
            return clone(readState(store).templateVersions
                .filter((version) => version.templateId === templateId)
                .sort((left, right) => left.version - right.version));
        },
        saveClientMergeEvent(event) {
            let persisted = null;
            store.update((state) => {
                const current = normalizeState(state);
                const nextEvent = clone(event);
                const replay = resolveClientMergeEventReplay(current.clientMergeEvents, nextEvent);
                if (replay) {
                    persisted = replay;
                    return current;
                }
                persisted = nextEvent;
                const exists = current.clientMergeEvents.some((item) => item.id === nextEvent.id);
                return {
                    ...current,
                    clientMergeEvents: exists
                        ? current.clientMergeEvents.map((item) => item.id === nextEvent.id ? nextEvent : item)
                        : [...current.clientMergeEvents, nextEvent]
                };
            });
            if (!persisted) {
                throw new Error(`Client merge event ${event.id} was not persisted.`);
            }
            return clone(persisted);
        },
        saveClientMergeConflict(conflict) {
            let persisted = null;
            store.update((state) => {
                const current = normalizeState(state);
                const nextConflict = {
                    ...clone(conflict),
                    state: parseClientMergeConflictState(conflict.state)
                };
                persisted = nextConflict;
                const exists = current.clientMergeConflicts.some((item) => item.id === nextConflict.id);
                return {
                    ...current,
                    clientMergeConflicts: exists
                        ? current.clientMergeConflicts.map((item) => item.id === nextConflict.id ? nextConflict : item)
                        : [...current.clientMergeConflicts, nextConflict]
                };
            });
            if (!persisted) {
                throw new Error(`Client merge conflict ${conflict.id} was not persisted.`);
            }
            return clone(persisted);
        },
        saveClientExportJob(job) {
            let persisted = null;
            store.update((state) => {
                const current = normalizeState(state);
                const nextJob = clone(job);
                persisted = nextJob;
                const exists = current.clientExportJobs.some((item) => item.exportId === nextJob.exportId);
                return {
                    ...current,
                    clientExportJobs: exists
                        ? current.clientExportJobs.map((item) => item.exportId === nextJob.exportId ? nextJob : item)
                        : [...current.clientExportJobs, nextJob]
                };
            });
            if (!persisted) {
                throw new Error(`Client export job ${job.exportId} was not persisted.`);
            }
            return clone(persisted);
        },
        saveClientProfile(profile) {
            let persisted = null;
            store.update((state) => {
                const current = normalizeState(state);
                const nextProfile = clone(profile);
                persisted = nextProfile;
                const exists = current.clientProfiles.some((item) => isSameClientProfileIdentity(item, nextProfile));
                return {
                    ...current,
                    clientProfiles: exists
                        ? current.clientProfiles.map((item) => isSameClientProfileIdentity(item, nextProfile) ? nextProfile : item)
                        : [...current.clientProfiles, nextProfile]
                };
            });
            if (!persisted) {
                throw new Error(`Client profile ${profile.sourceProfileId} was not persisted.`);
            }
            return clone(persisted);
        },
        saveFileScanResultIdempotency(record) {
            let persisted = null;
            store.update((state) => {
                const current = normalizeState(state);
                const existing = current.fileScanResultIdempotency.find((item) => item.key === record.key);
                if (existing) {
                    persisted = existing;
                    return current;
                }
                const nextRecord = clone(record);
                persisted = nextRecord;
                return {
                    ...current,
                    fileScanResultIdempotency: [...current.fileScanResultIdempotency, nextRecord]
                };
            });
            if (!persisted) {
                throw new Error(`File scan idempotency key ${record.key} was not persisted.`);
            }
            return clone(persisted);
        },
        saveFile(file) {
            let persisted = null;
            store.update((state) => {
                const current = normalizeState(state);
                const nextFile = clone(file);
                persisted = nextFile;
                const exists = current.files.some((item) => item.fileId === nextFile.fileId);
                return {
                    ...current,
                    files: exists
                        ? current.files.map((item) => item.fileId === nextFile.fileId ? nextFile : item)
                        : [...current.files, nextFile]
                };
            });
            if (!persisted) {
                throw new Error(`File ${file.fileId} was not persisted.`);
            }
            return clone(persisted);
        },
        saveKnowledgeArticle(article) {
            let persisted = null;
            store.update((state) => {
                const current = normalizeState(state);
                const nextArticle = clone(article);
                persisted = nextArticle;
                const exists = current.knowledgeArticles.some((item) => isSameKnowledgeArticleIdentity(item, nextArticle));
                return {
                    ...current,
                    knowledgeArticles: exists
                        ? current.knowledgeArticles.map((item) => isSameKnowledgeArticleIdentity(item, nextArticle) ? nextArticle : item)
                        : [...current.knowledgeArticles, nextArticle]
                };
            });
            if (!persisted) {
                throw new Error(`Knowledge article ${article.id} was not persisted.`);
            }
            return clone(persisted);
        },
        saveKnowledgeApprovalDecision(decision) {
            let persisted = null;
            store.update((state) => {
                const current = normalizeState(state);
                const nextDecision = clone(decision);
                const existing = current.knowledgeApprovalDecisions.find((item) => item.articleId === nextDecision.articleId && item.id === nextDecision.id);
                if (existing && isDuplicateKnowledgeApprovalDecisionReplay(existing, nextDecision)) {
                    persisted = existing;
                    return current;
                }
                if (existing) {
                    throw new Error(`Knowledge approval decision ${nextDecision.id} conflicts with existing immutable decision.`);
                }
                persisted = nextDecision;
                return {
                    ...current,
                    knowledgeApprovalDecisions: existing
                        ? current.knowledgeApprovalDecisions.map((item) => item.articleId === nextDecision.articleId && item.id === nextDecision.id ? nextDecision : item)
                        : [...current.knowledgeApprovalDecisions, nextDecision]
                };
            });
            if (!persisted) {
                throw new Error(`Knowledge approval decision ${decision.id} was not persisted.`);
            }
            return clone(persisted);
        },
        saveKnowledgeDraftVersion(version) {
            let persisted = null;
            store.update((state) => {
                const current = normalizeState(state);
                const nextVersion = clone(version);
                const existing = current.knowledgeDraftVersions.find((item) => item.articleId === nextVersion.articleId && item.id === nextVersion.id);
                if (existing && isDuplicateKnowledgeDraftVersionReplay(existing, nextVersion)) {
                    persisted = existing;
                    return current;
                }
                if (existing) {
                    throw new Error(`Knowledge draft version ${nextVersion.id} conflicts with existing draft decision.`);
                }
                persisted = nextVersion;
                return {
                    ...current,
                    knowledgeDraftVersions: existing
                        ? current.knowledgeDraftVersions.map((item) => item.articleId === nextVersion.articleId && item.id === nextVersion.id ? nextVersion : item)
                        : [...current.knowledgeDraftVersions, nextVersion]
                };
            });
            if (!persisted) {
                throw new Error(`Knowledge draft version ${version.id} was not persisted.`);
            }
            return clone(persisted);
        },
        saveTemplate(template) {
            let persisted = null;
            store.update((state) => {
                const current = normalizeState(state);
                const nextTemplate = clone(template);
                const existingTemplate = current.templates.find((item) => item.id === nextTemplate.id);
                if (existingTemplate && existingTemplate.tenantId !== nextTemplate.tenantId) {
                    throw new TemplateOwnershipConflictError(nextTemplate.id);
                }
                persisted = nextTemplate;
                const exists = Boolean(existingTemplate);
                return {
                    ...current,
                    templates: exists
                        ? current.templates.map((item) => item.id === nextTemplate.id ? nextTemplate : item)
                        : [...current.templates, nextTemplate]
                };
            });
            if (!persisted) {
                throw new Error(`Template ${template.id} was not persisted.`);
            }
            return clone(persisted);
        },
        saveTemplateAuditEvent(event) {
            let persisted = null;
            store.update((state) => {
                const current = normalizeState(state);
                const nextEvent = clone(event);
                persisted = nextEvent;
                const exists = current.templateAuditEvents.some((item) => item.id === nextEvent.id);
                return {
                    ...current,
                    templateAuditEvents: exists
                        ? current.templateAuditEvents.map((item) => item.id === nextEvent.id ? nextEvent : item)
                        : [...current.templateAuditEvents, nextEvent]
                };
            });
            if (!persisted) {
                throw new Error(`Template audit event ${event.id} was not persisted.`);
            }
            return clone(persisted);
        },
        saveTemplateVersion(version) {
            let persisted = null;
            store.update((state) => {
                const current = normalizeState(state);
                const nextVersion = clone(version);
                persisted = nextVersion;
                const exists = current.templateVersions.some((item) => isSameTemplateVersion(item, nextVersion));
                return {
                    ...current,
                    templateVersions: exists
                        ? current.templateVersions.map((item) => isSameTemplateVersion(item, nextVersion) ? nextVersion : item)
                        : [...current.templateVersions, nextVersion]
                };
            });
            if (!persisted) {
                throw new Error(`Template version ${version.templateId}@${version.version} was not persisted.`);
            }
            return clone(persisted);
        },
        updateFileScanResult(fileId, scanResult) {
            let persisted;
            store.update((state) => {
                const current = normalizeState(state);
                const existing = current.files.find((item) => item.fileId === fileId);
                if (!existing) {
                    persisted = undefined;
                    return current;
                }
                const nextFile = {
                    ...existing,
                    ...clone(scanResult)
                };
                persisted = nextFile;
                return {
                    ...current,
                    files: current.files.map((item) => item.fileId === fileId ? nextFile : item)
                };
            });
            return clone(persisted);
        },
        updateClientMergeConflictState(conflictId, state) {
            const nextState = parseClientMergeConflictState(state);
            let persisted;
            store.update((currentState) => {
                const current = normalizeState(currentState);
                const existing = current.clientMergeConflicts.find((item) => item.id === conflictId);
                if (!existing) {
                    persisted = undefined;
                    return current;
                }
                const nextConflict = {
                    ...existing,
                    state: nextState
                };
                persisted = nextConflict;
                return {
                    ...current,
                    clientMergeConflicts: current.clientMergeConflicts.map((item) => item.id === conflictId ? nextConflict : item)
                };
            });
            return clone(persisted);
        },
        updateKnowledgeArticlePublicationState(articleId, state) {
            let persisted;
            store.update((currentState) => {
                const current = normalizeState(currentState);
                const existing = current.knowledgeArticles.find((article) => article.id === articleId);
                if (!existing) {
                    persisted = undefined;
                    return current;
                }
                const nextArticle = {
                    ...existing,
                    status: state.status,
                    updated: state.updated,
                    visibility: state.visibility
                };
                persisted = nextArticle;
                return {
                    ...current,
                    knowledgeArticles: current.knowledgeArticles.map((article) => isSameKnowledgeArticleIdentity(article, nextArticle) ? nextArticle : article)
                };
            });
            return clone(persisted);
        },
        updateKnowledgeDraftVersionState(articleId, draftId, state) {
            let persisted;
            store.update((currentState) => {
                const current = normalizeState(currentState);
                const existing = current.knowledgeDraftVersions.find((version) => version.articleId === articleId && version.id === draftId);
                if (!existing) {
                    persisted = undefined;
                    return current;
                }
                const nextVersion = {
                    ...existing,
                    status: state.status,
                    updated: state.updated
                };
                persisted = nextVersion;
                return {
                    ...current,
                    knowledgeDraftVersions: current.knowledgeDraftVersions.map((version) => version.articleId === articleId && version.id === draftId ? nextVersion : version)
                };
            });
            return clone(persisted);
        }
    };
}
export function createEmptyWorkspaceState() {
    return {
        clientExportJobs: [],
        clientMergeConflicts: [],
        clientMergeEvents: [],
        clientProfiles: [],
        fileScanResultIdempotency: [],
        files: [],
        knowledgeApprovalDecisions: [],
        knowledgeArticles: [],
        knowledgeDraftVersions: [],
        templateAuditEvents: [],
        templates: [],
        templateVersions: []
    };
}
function normalizeState(state) {
    return {
        clientExportJobs: normalizeClientExportJobs(state.clientExportJobs),
        clientMergeConflicts: state.clientMergeConflicts ?? [],
        clientMergeEvents: state.clientMergeEvents ?? [],
        clientProfiles: state.clientProfiles ?? [],
        fileScanResultIdempotency: state.fileScanResultIdempotency ?? [],
        files: state.files ?? [],
        knowledgeApprovalDecisions: state.knowledgeApprovalDecisions ?? [],
        knowledgeArticles: state.knowledgeArticles ?? [],
        knowledgeDraftVersions: state.knowledgeDraftVersions ?? [],
        templateAuditEvents: state.templateAuditEvents ?? [],
        templates: state.templates ?? [],
        templateVersions: state.templateVersions ?? []
    };
}
function normalizeClientExportJobs(jobs) {
    return (jobs ?? []).map((job) => ({
        auditEvent: clone(job.auditEvent ?? {}),
        createdAt: String(job.createdAt ?? ""),
        exportId: String(job.exportId ?? ""),
        fileDescriptor: clone(job.fileDescriptor ?? {}),
        filters: clone(job.filters ?? {}),
        format: String(job.format ?? "json"),
        itemCount: Number.isFinite(Number(job.itemCount)) ? Number(job.itemCount) : 0,
        reason: String(job.reason ?? ""),
        ...(job.segment ? { segment: clone(job.segment) } : {}),
        sensitiveFieldsMasked: true,
        status: String(job.status ?? "queued"),
        ...(job.tenantId ? { tenantId: String(job.tenantId) } : {})
    }));
}
function readState(store) {
    return normalizeState(store.read());
}
function isClientProfileInScope(profile, scope) {
    return !scope.tenantId || profile.tenantId === scope.tenantId;
}
function isTemplateInScope(template, scope) {
    return !scope.tenantId || template.tenantId === scope.tenantId;
}
function isKnowledgeArticleInScope(article, scope) {
    return !scope.tenantId || article.tenantId === scope.tenantId;
}
function isClientMergeEventInScope(event, filters) {
    return (!filters.tenantId || event.tenantId === filters.tenantId)
        && (!filters.primaryProfileId || event.primaryProfileId === filters.primaryProfileId)
        && (!filters.candidateProfileId || event.candidateProfileId === filters.candidateProfileId)
        && (!filters.detachedProfileId || event.detachedProfileId === filters.detachedProfileId);
}
function resolveClientMergeEventReplay(existingEvents, nextEvent) {
    const existingById = existingEvents.find((event) => event.id === nextEvent.id);
    if (existingById) {
        if (isSameClientMergeEventPayload(existingById, nextEvent)) {
            return clone(existingById);
        }
        throw new Error(`Client merge event ${nextEvent.id} conflicts with existing immutable event.`);
    }
    const existingByEdge = existingEvents.find((event) => isSameClientMergeEdge(event, nextEvent));
    if (existingByEdge) {
        if (isSameClientMergeEventPayload(existingByEdge, nextEvent, { ignoreId: true })) {
            return clone(existingByEdge);
        }
        throw new Error(`Client merge edge ${nextEvent.mergeGraphEdge} conflicts with existing immutable event.`);
    }
    return undefined;
}
function isClientMergeConflictInScope(conflict, filters) {
    return (!filters.tenantId || conflict.tenantId === filters.tenantId)
        && (!filters.primaryProfileId || conflict.primaryProfileId === filters.primaryProfileId)
        && (!filters.state || conflict.state === filters.state);
}
function isSameClientProfileIdentity(left, right) {
    return left.sourceProfileId === right.sourceProfileId
        && (left.tenantId ?? null) === (right.tenantId ?? null);
}
function isSameTemplateVersion(left, right) {
    return left.templateId === right.templateId
        && left.version === right.version;
}
function isSameKnowledgeArticleIdentity(left, right) {
    return left.id === right.id
        && left.tenantId === right.tenantId;
}
function isDuplicateKnowledgeDraftVersionReplay(left, right) {
    return left.articleId === right.articleId
        && left.id === right.id
        && left.author === right.author
        && left.body === right.body
        && (left.changes ?? null) === (right.changes ?? null)
        && left.label === right.label
        && left.status === right.status;
}
function isDuplicateKnowledgeApprovalDecisionReplay(left, right) {
    return left.articleId === right.articleId
        && left.id === right.id
        && left.action === right.action
        && left.actor === right.actor
        && (left.draftId ?? null) === (right.draftId ?? null)
        && left.immutable === right.immutable
        && (left.reason ?? null) === (right.reason ?? null);
}
function isSameClientMergeEdge(left, right) {
    return clientMergeEventTenantId(left) === clientMergeEventTenantId(right)
        && left.action === right.action
        && left.mergeGraphEdge === right.mergeGraphEdge;
}
function isSameClientMergeEventPayload(left, right, options = {}) {
    return (options.ignoreId || left.id === right.id)
        && left.action === right.action
        && left.candidateProfileId === right.candidateProfileId
        && left.detachedProfileId === right.detachedProfileId
        && left.immutable === right.immutable
        && left.mergeGraphEdge === right.mergeGraphEdge
        && left.primaryProfileId === right.primaryProfileId
        && (left.reason ?? null) === (right.reason ?? null)
        && clientMergeEventTenantId(left) === clientMergeEventTenantId(right);
}
function clientMergeEventTenantId(event) {
    return requireWorkspaceTenantId(event.tenantId);
}
function parseClientMergeConflictState(state) {
    if (state === "dismissed" || state === "open" || state === "resolved") {
        return state;
    }
    throw new Error(`Unsupported client merge conflict state: ${state}`);
}
function toPrismaWorkspaceFileCreateInput(file) {
    return {
        auditId: file.auditId,
        channel: file.channel,
        checksum: file.checksum ?? null,
        fileId: file.fileId,
        fileName: file.fileName,
        mimeType: file.mimeType,
        objectKey: file.objectKey,
        scanCheckedAt: file.scanCheckedAt ? new Date(file.scanCheckedAt) : null,
        scanReason: file.scanReason ?? null,
        scanState: file.scanState,
        scanVerdict: file.scanVerdict ?? null,
        scanner: file.scanner ?? null,
        sizeBytes: BigInt(file.sizeBytes),
        storageState: file.storageState,
        tenantId: requireWorkspaceTenantId(file.tenantId)
    };
}
function toPrismaWorkspaceFileUpdateInput(file) {
    return {
        auditId: file.auditId,
        channel: file.channel,
        checksum: file.checksum,
        fileName: file.fileName,
        mimeType: file.mimeType,
        objectKey: file.objectKey,
        scanCheckedAt: file.scanCheckedAt,
        scanReason: file.scanReason,
        scanState: file.scanState,
        scanVerdict: file.scanVerdict,
        scanner: file.scanner,
        sizeBytes: file.sizeBytes,
        storageState: file.storageState,
        tenantId: file.tenantId
    };
}
function toPrismaWorkspaceFileScanUpdateInput(scanResult) {
    return {
        scanCheckedAt: scanResult.scanCheckedAt ? new Date(scanResult.scanCheckedAt) : null,
        scanReason: scanResult.scanReason ?? null,
        scanState: scanResult.scanState,
        scanVerdict: scanResult.scanVerdict ?? null,
        scanner: scanResult.scanner ?? null
    };
}
function toFileScanResultIdempotencyRecord(row) {
    return {
        fileId: row.fileId,
        fingerprint: row.fingerprint,
        key: row.key,
        result: clone(row.result)
    };
}
function toFileRecord(row) {
    return {
        auditId: row.auditId,
        channel: row.channel,
        ...(row.checksum !== null ? { checksum: row.checksum } : {}),
        fileId: row.fileId,
        fileName: row.fileName,
        mimeType: row.mimeType,
        objectKey: row.objectKey,
        ...(row.scanCheckedAt ? { scanCheckedAt: row.scanCheckedAt.toISOString() } : {}),
        ...(row.scanReason !== null ? { scanReason: row.scanReason } : {}),
        scanState: row.scanState,
        ...(row.scanVerdict !== null ? { scanVerdict: row.scanVerdict } : {}),
        ...(row.scanner !== null ? { scanner: row.scanner } : {}),
        sizeBytes: Number(row.sizeBytes),
        storageState: row.storageState,
        tenantId: row.tenantId
    };
}
function toPrismaClientExportJobCreateInput(job) {
    return {
        auditEvent: clone(job.auditEvent),
        createdAt: new Date(job.createdAt),
        exportId: job.exportId,
        fileDescriptor: clone(job.fileDescriptor),
        filters: clone(job.filters),
        format: job.format,
        itemCount: job.itemCount,
        reason: job.reason,
        segment: job.segment ? clone(job.segment) : null,
        sensitiveFieldsMasked: true,
        status: job.status,
        tenantId: requireWorkspaceTenantId(job.tenantId)
    };
}
function toPrismaClientExportJobUpdateInput(job) {
    return {
        auditEvent: clone(job.auditEvent),
        createdAt: job.createdAt,
        fileDescriptor: clone(job.fileDescriptor),
        filters: clone(job.filters),
        format: job.format,
        itemCount: job.itemCount,
        reason: job.reason,
        segment: job.segment ? clone(job.segment) : null,
        sensitiveFieldsMasked: true,
        status: job.status,
        tenantId: job.tenantId
    };
}
function toClientExportJobRecord(row) {
    return {
        auditEvent: clone(row.auditEvent),
        createdAt: row.createdAt.toISOString(),
        exportId: row.exportId,
        fileDescriptor: clone(row.fileDescriptor),
        filters: clone(row.filters),
        format: row.format,
        itemCount: row.itemCount,
        reason: row.reason,
        ...(row.segment ? { segment: clone(row.segment) } : {}),
        sensitiveFieldsMasked: true,
        status: row.status,
        tenantId: row.tenantId
    };
}
function toPrismaClientProfileCreateInput(profile) {
    return {
        channel: profile.channel,
        clientSince: profile.clientSince,
        device: profile.device,
        entry: profile.entry,
        id: profile.id,
        name: profile.name,
        phone: profile.phone,
        previous: clone(profile.previous),
        sourceProfileId: profile.sourceProfileId,
        tenantId: requireWorkspaceTenantId(profile.tenantId),
        topic: profile.topic
    };
}
function toPrismaClientProfileUpdateInput(profile) {
    return {
        channel: profile.channel,
        clientSince: profile.clientSince,
        device: profile.device,
        entry: profile.entry,
        name: profile.name,
        phone: profile.phone,
        previous: clone(profile.previous),
        topic: profile.topic
    };
}
function toClientProfileRecord(row) {
    return {
        channel: row.channel,
        clientSince: row.clientSince,
        device: row.device,
        entry: row.entry,
        id: row.id,
        name: row.name,
        phone: row.phone,
        previous: clone(row.previous),
        sourceProfileId: row.sourceProfileId,
        tenantId: row.tenantId,
        topic: row.topic
    };
}
function toPrismaClientMergeEventCreateInput(event) {
    return {
        action: event.action,
        candidateProfileId: event.candidateProfileId ?? null,
        detachedProfileId: event.detachedProfileId ?? null,
        id: event.id,
        immutable: event.immutable,
        mergeGraphEdge: event.mergeGraphEdge,
        primaryProfileId: event.primaryProfileId,
        reason: event.reason ?? null,
        tenantId: requireWorkspaceTenantId(event.tenantId)
    };
}
function toPrismaClientMergeEventUpdateInput(event) {
    return {
        action: event.action,
        candidateProfileId: event.candidateProfileId,
        detachedProfileId: event.detachedProfileId,
        immutable: event.immutable,
        mergeGraphEdge: event.mergeGraphEdge,
        primaryProfileId: event.primaryProfileId,
        reason: event.reason,
        tenantId: event.tenantId
    };
}
function toClientMergeEvent(row) {
    return {
        action: row.action,
        ...(row.candidateProfileId !== null ? { candidateProfileId: row.candidateProfileId } : {}),
        ...(row.detachedProfileId !== null ? { detachedProfileId: row.detachedProfileId } : {}),
        id: row.id,
        immutable: true,
        mergeGraphEdge: row.mergeGraphEdge,
        primaryProfileId: row.primaryProfileId,
        ...(row.reason !== null ? { reason: row.reason } : {}),
        tenantId: row.tenantId
    };
}
function toPrismaClientMergeConflictCreateInput(conflict) {
    return {
        candidateProfileId: conflict.candidateProfileId,
        conflictingFields: clone(conflict.conflictingFields),
        id: conflict.id,
        primaryProfileId: conflict.primaryProfileId,
        reason: conflict.reason,
        state: parseClientMergeConflictState(conflict.state),
        tenantId: requireWorkspaceTenantId(conflict.tenantId)
    };
}
function toPrismaClientMergeConflictUpsertUpdateInput(conflict) {
    return {
        candidateProfileId: conflict.candidateProfileId,
        conflictingFields: clone(conflict.conflictingFields),
        primaryProfileId: conflict.primaryProfileId,
        reason: conflict.reason,
        state: conflict.state,
        tenantId: conflict.tenantId
    };
}
function toClientMergeConflictRecord(row) {
    return {
        candidateProfileId: row.candidateProfileId,
        conflictingFields: clone(row.conflictingFields),
        id: row.id,
        primaryProfileId: row.primaryProfileId,
        reason: row.reason,
        state: parseClientMergeConflictState(row.state),
        tenantId: row.tenantId
    };
}
function toPrismaKnowledgeArticleCreateInput(article) {
    return {
        approvalHistory: clone(article.approvalHistory),
        attachments: clone(article.attachments),
        body: article.body,
        category: article.category,
        channels: clone(article.channels),
        helpfulRate: article.helpfulRate,
        id: article.id,
        owner: article.owner,
        status: article.status,
        tenantId: requireWorkspaceTenantId(article.tenantId),
        title: article.title,
        topics: clone(article.topics),
        updatedAt: new Date(article.updated),
        usage: article.usage,
        version: article.version,
        versions: clone(article.versions),
        visibility: article.visibility
    };
}
function toPrismaKnowledgeArticleUpdateInput(article) {
    return {
        approvalHistory: clone(article.approvalHistory),
        attachments: clone(article.attachments),
        body: article.body,
        category: article.category,
        channels: clone(article.channels),
        helpfulRate: article.helpfulRate,
        owner: article.owner,
        status: article.status,
        tenantId: article.tenantId,
        title: article.title,
        topics: clone(article.topics),
        updatedAt: article.updatedAt,
        usage: article.usage,
        version: article.version,
        versions: clone(article.versions),
        visibility: article.visibility
    };
}
function toKnowledgeArticle(row) {
    return {
        approvalHistory: clone(row.approvalHistory),
        attachments: clone(row.attachments),
        body: row.body,
        category: row.category,
        channels: clone(row.channels),
        helpfulRate: row.helpfulRate,
        id: row.id,
        owner: row.owner,
        status: row.status,
        tenantId: row.tenantId,
        title: row.title,
        topics: clone(row.topics),
        updated: row.updatedAt.toISOString(),
        usage: row.usage,
        version: row.version,
        versions: clone(row.versions),
        visibility: row.visibility
    };
}
function toPrismaKnowledgeDraftVersionCreateInput(version) {
    return {
        articleId: version.articleId,
        author: version.author,
        body: version.body,
        changes: version.changes ?? null,
        id: version.id,
        label: version.label,
        status: version.status,
        updatedAt: new Date(version.updated)
    };
}
function toPrismaKnowledgeDraftVersionUpdateInput(version) {
    return {
        articleId: version.articleId,
        author: version.author,
        body: version.body,
        changes: version.changes,
        label: version.label,
        status: version.status,
        updatedAt: version.updatedAt
    };
}
function toKnowledgeDraftVersionRecord(row) {
    return {
        articleId: row.articleId,
        author: row.author,
        body: row.body,
        ...(row.changes !== null ? { changes: row.changes } : {}),
        id: row.id,
        label: row.label,
        status: row.status,
        updated: row.updatedAt.toISOString()
    };
}
function toPrismaKnowledgeApprovalDecisionCreateInput(decision) {
    return {
        action: decision.action,
        actor: decision.actor,
        articleId: decision.articleId,
        draftId: decision.draftId ?? null,
        id: decision.id,
        immutable: decision.immutable,
        reason: decision.reason ?? null,
        timestamp: new Date(decision.timestamp)
    };
}
function toPrismaKnowledgeApprovalDecisionUpdateInput(decision) {
    return {
        action: decision.action,
        actor: decision.actor,
        articleId: decision.articleId,
        draftId: decision.draftId,
        immutable: decision.immutable,
        reason: decision.reason,
        timestamp: decision.timestamp
    };
}
function toKnowledgeApprovalDecisionRecord(row) {
    return {
        action: row.action,
        actor: row.actor,
        articleId: row.articleId,
        ...(row.draftId !== null ? { draftId: row.draftId } : {}),
        id: row.id,
        immutable: true,
        ...(row.reason !== null ? { reason: row.reason } : {}),
        timestamp: row.timestamp.toISOString()
    };
}
function toPrismaTemplateRecordCreateInput(template) {
    return {
        auditId: template.auditId ?? null,
        channel: template.channel,
        id: template.id,
        ownerId: template.ownerId ?? null,
        scope: template.scope,
        tenantId: requireWorkspaceTenantId(template.tenantId),
        text: template.text,
        title: template.title,
        topic: template.topic,
        updatedAt: new Date(template.updated),
        usage: template.usage,
        version: template.version
    };
}
function toPrismaTemplateRecordUpdateInput(template) {
    return {
        auditId: template.auditId,
        channel: template.channel,
        ownerId: template.ownerId,
        scope: template.scope,
        tenantId: template.tenantId,
        text: template.text,
        title: template.title,
        topic: template.topic,
        updatedAt: template.updatedAt,
        usage: template.usage,
        version: template.version
    };
}
function toTemplateRecord(row) {
    return {
        ...(row.auditId !== null ? { auditId: row.auditId } : {}),
        channel: row.channel,
        id: row.id,
        ownerId: row.ownerId ?? null,
        scope: row.scope,
        tenantId: row.tenantId,
        text: row.text,
        title: row.title,
        topic: row.topic,
        updated: row.updatedAt.toISOString(),
        usage: row.usage,
        version: row.version
    };
}
function toPrismaTemplateVersionCreateInput(version) {
    return {
        channel: version.channel,
        id: version.id,
        scope: version.scope,
        templateId: version.templateId,
        text: version.text,
        title: version.title,
        topic: version.topic,
        updatedAt: new Date(version.updated),
        usage: version.usage,
        version: version.version
    };
}
function toPrismaTemplateVersionUpdateInput(version) {
    return {
        channel: version.channel,
        scope: version.scope,
        templateId: version.templateId,
        text: version.text,
        title: version.title,
        topic: version.topic,
        updatedAt: version.updatedAt,
        usage: version.usage,
        version: version.version
    };
}
function toTemplateVersionRecord(row) {
    return {
        channel: row.channel,
        id: row.id,
        scope: row.scope,
        templateId: row.templateId,
        text: row.text,
        title: row.title,
        topic: row.topic,
        updated: row.updatedAt.toISOString(),
        usage: row.usage,
        version: row.version
    };
}
function toPrismaTemplateAuditEventCreateInput(event) {
    return {
        action: event.action,
        id: event.id,
        immutable: event.immutable,
        reason: event.reason ?? null,
        templateId: event.templateId,
        timestamp: new Date(event.timestamp)
    };
}
function toPrismaTemplateAuditEventUpdateInput(event) {
    return {
        action: event.action,
        immutable: event.immutable,
        reason: event.reason,
        templateId: event.templateId,
        timestamp: event.timestamp
    };
}
function toTemplateAuditRecord(row) {
    return {
        action: row.action,
        id: row.id,
        immutable: true,
        ...(row.reason !== null ? { reason: row.reason } : {}),
        templateId: row.templateId,
        timestamp: row.timestamp.toISOString()
    };
}
function clientMergeEventWhere(filters) {
    const where = {};
    if (filters.tenantId)
        where.tenantId = filters.tenantId;
    if (filters.primaryProfileId)
        where.primaryProfileId = filters.primaryProfileId;
    if (filters.candidateProfileId)
        where.candidateProfileId = filters.candidateProfileId;
    if (filters.detachedProfileId)
        where.detachedProfileId = filters.detachedProfileId;
    return Object.keys(where).length ? where : undefined;
}
function clientMergeConflictWhere(filters) {
    const where = {};
    if (filters.tenantId)
        where.tenantId = filters.tenantId;
    if (filters.primaryProfileId)
        where.primaryProfileId = filters.primaryProfileId;
    if (filters.state)
        where.state = filters.state;
    return Object.keys(where).length ? where : undefined;
}
function clone(value) {
    if (value === undefined) {
        return value;
    }
    return JSON.parse(JSON.stringify(value));
}
function requireWorkspaceTenantId(value) {
    const tenantId = String(value ?? "").trim();
    if (!tenantId) {
        throw new Error("workspace_tenant_id_required");
    }
    return tenantId;
}
function isPrismaNotFoundError(error) {
    return typeof error === "object" && error !== null && "code" in error && error.code === "P2025";
}
function isUniqueConstraintError(error) {
    return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}
//# sourceMappingURL=workspace.repository.js.map