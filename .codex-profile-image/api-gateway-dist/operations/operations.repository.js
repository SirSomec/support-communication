import { createHash } from "node:crypto";
import { InMemoryStore } from "@support-communication/database";
let defaultRepository = null;
export class OperationsRepository {
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
        return OperationsRepository.inMemory();
    }
    static useDefault(repository) {
        defaultRepository = repository;
    }
    static clearDefault() {
        defaultRepository = null;
    }
    static inMemory(seed) {
        return new OperationsRepository(new InMemoryStore(seed ?? createEmptyOperationsState()));
    }
    static prisma({ client, seed }) {
        assertCompletePrismaOperationsClient(client);
        return new OperationsRepository(new InMemoryStore(seed ?? createEmptyOperationsState()), client);
    }
    readState() {
        if (this.prismaClient) {
            throw new Error("prisma_operations_async_required");
        }
        return normalizeState(this.store.read());
    }
    async readStateAsync() {
        if (!this.prismaClient) {
            return this.readState();
        }
        const state = normalizeState(this.store.read());
        const [runtimeRows, postgresRows, objectStorageRows] = await Promise.all([
            this.prismaClient.operationsRuntimeRecord.findMany({ orderBy: { updatedAt: "desc" } }),
            this.prismaClient.operationsPostgresRestoreCheckResult.findMany({ orderBy: { executedAt: "desc" } }),
            this.prismaClient.operationsObjectStorageRestoreCheckResult.findMany({ orderBy: { verifiedAt: "desc" } })
        ]);
        for (const row of runtimeRows) {
            appendRuntimeRecord(state, row.collection, row.record);
        }
        state.postgresRestoreCheckResults = postgresRows.map(toPostgresRestoreCheckResult);
        state.objectStorageRestoreCheckExistenceResults = objectStorageRows
            .filter((row) => row.checkKind === "existence")
            .map(toObjectStorageRestoreCheckExistenceResult);
        state.objectStorageRestoreCheckChecksumResults = objectStorageRows
            .filter((row) => row.checkKind === "checksum")
            .map(toObjectStorageRestoreCheckChecksumResult);
        state.objectStorageRestoreCheckMetadataResults = objectStorageRows
            .filter((row) => row.checkKind === "metadata")
            .map(toObjectStorageRestoreCheckMetadataResult);
        return normalizeState(state);
    }
    listLoadTestScenarios() {
        return clone(this.readCatalogState().loadTestScenarios);
    }
    listBackupDrills() {
        return clone(this.readCatalogState().backupDrills);
    }
    listDeadLetterQueues() {
        return clone(this.readCatalogState().deadLetterQueues);
    }
    listDeadLetterMessages() {
        return clone(this.readCatalogState().deadLetterMessages);
    }
    listMigrationCandidates() {
        return clone(this.readCatalogState().migrationCandidates);
    }
    listSecurityControls() {
        return clone(this.readCatalogState().securityControls);
    }
    async findLoadTestIdempotencyKeyAsync(key) {
        return this.findRuntimeRecord("loadTestIdempotencyKeys", key);
    }
    async saveLoadTestIdempotencyKeyAsync(record) {
        return this.saveIdempotencyKeyAsync("loadTestIdempotencyKeys", record);
    }
    async saveLoadTestRunAsync(record) {
        return this.saveRuntimeRecord("loadTestRuns", String(record.run.id ?? ""), record);
    }
    async findRestoreCheckIdempotencyKeyAsync(key) {
        return this.findRuntimeRecord("restoreCheckIdempotencyKeys", key);
    }
    async saveRestoreCheckIdempotencyKeyAsync(record) {
        return this.saveIdempotencyKeyAsync("restoreCheckIdempotencyKeys", record);
    }
    async saveRestoreCheckAsync(record) {
        return this.saveRuntimeRecord("restoreChecks", String(record.restoreCheck.id ?? ""), record);
    }
    async findDeadLetterReplayIdempotencyKeyAsync(key) {
        return this.findRuntimeRecord("deadLetterReplayIdempotencyKeys", key);
    }
    async saveDeadLetterReplayIdempotencyKeyAsync(record) {
        return this.saveIdempotencyKeyAsync("deadLetterReplayIdempotencyKeys", record);
    }
    async findDeadLetterReplayAsync(replayId) {
        return this.findRuntimeRecord("deadLetterReplays", replayId);
    }
    async saveDeadLetterReplayAsync(record) {
        return this.saveRuntimeRecord("deadLetterReplays", String(record.replay.id ?? ""), record);
    }
    async saveDeadLetterReplayValidationDenialAsync(record) {
        return this.saveRuntimeRecord("deadLetterReplayValidationDenials", String(record.auditEvent.id ?? runtimeRecordId("deadLetterReplayValidationDenials", `${record.messageId}:${Date.now()}`)), record, record.messageId);
    }
    async listDeadLetterReplayValidationDenialsAsync(filters = {}) {
        return this.listRuntimeRecords("deadLetterReplayValidationDenials", { filterKey: filters.messageId });
    }
    async saveDeadLetterReplayRequeueAuditAsync(record) {
        return this.saveRuntimeRecord("deadLetterReplayRequeueAudits", String(record.auditEvent.id ?? runtimeRecordId("deadLetterReplayRequeueAudits", `${record.messageId}:${Date.now()}`)), record, record.messageId);
    }
    async listDeadLetterReplayRequeueAuditsAsync(filters = {}) {
        return this.listRuntimeRecords("deadLetterReplayRequeueAudits", { filterKey: filters.messageId });
    }
    async saveMigrationRollbackCheckAsync(record) {
        return this.saveRuntimeRecord("migrationRollbackChecks", String(record.auditEvent.id ?? runtimeRecordId("migrationRollbackChecks", `${record.migrationId}:${Date.now()}`)), record, record.migrationId);
    }
    async findMigrationRollbackCheckResultAsync(resultId) {
        return this.findRuntimeRecord("migrationRollbackCheckResults", resultId);
    }
    async listMigrationRollbackCheckResultsAsync(filters = {}) {
        return this.listRuntimeRecords("migrationRollbackCheckResults", { filterKey: filters.migrationId });
    }
    async saveMigrationRollbackCheckResultAsync(record) {
        return this.saveRuntimeRecord("migrationRollbackCheckResults", record.id, record, record.migrationId);
    }
    async listLoadTestRunExecutionsAsync(filters = {}) {
        return this.listRuntimeRecords("loadTestRunExecutions", { filterKey: filters.status });
    }
    async findLoadTestRunExecutionAsync(runId) {
        return this.findRuntimeRecord("loadTestRunExecutions", runId);
    }
    async saveLoadTestRunExecutionAsync(record) {
        return this.saveRuntimeRecord("loadTestRunExecutions", record.runId, record, record.status);
    }
    async findLoadTestRunMetricsAsync(runId) {
        return this.findRuntimeRecord("loadTestRunMetrics", runId);
    }
    async saveLoadTestRunMetricsAsync(record) {
        return this.saveRuntimeRecord("loadTestRunMetrics", record.runId, record);
    }
    async findLoadTestRunErrorSummaryAsync(runId) {
        return this.findRuntimeRecord("loadTestRunErrorSummaries", runId);
    }
    async saveLoadTestRunErrorSummaryAsync(record) {
        return this.saveRuntimeRecord("loadTestRunErrorSummaries", record.runId, record);
    }
    async findPostgresRestoreCheckResultAsync(resultId) {
        if (!this.prismaClient) {
            return this.findPostgresRestoreCheckResult(resultId);
        }
        const row = await this.prismaClient.operationsPostgresRestoreCheckResult.findUnique({ where: { id: resultId } });
        return row ? toPostgresRestoreCheckResult(row) : undefined;
    }
    async listPostgresRestoreCheckResultsAsync(filters = {}) {
        if (!this.prismaClient) {
            return this.listPostgresRestoreCheckResults(filters);
        }
        const rows = await this.prismaClient.operationsPostgresRestoreCheckResult.findMany({
            orderBy: { executedAt: "desc" },
            where: {
                ...(filters.drillId ? { drillId: filters.drillId } : {}),
                ...(filters.restoreCheckId ? { restoreCheckId: filters.restoreCheckId } : {})
            }
        });
        return rows.map(toPostgresRestoreCheckResult);
    }
    async savePostgresRestoreCheckResultAsync(record) {
        if (!this.prismaClient) {
            return this.savePostgresRestoreCheckResult(record);
        }
        const data = toPrismaPostgresRestoreCheckResultCreateInput(record);
        const row = await this.prismaClient.operationsPostgresRestoreCheckResult.upsert({
            create: data,
            update: toPrismaPostgresRestoreCheckResultUpdateInput(record),
            where: { id: record.id }
        });
        return toPostgresRestoreCheckResult(row);
    }
    async listObjectStorageRestoreCheckExistenceResultsAsync(filters = {}) {
        const rows = await this.listObjectStorageRestoreCheckRows("existence", filters);
        return rows.map(toObjectStorageRestoreCheckExistenceResult);
    }
    async saveObjectStorageRestoreCheckExistenceResultAsync(record) {
        if (!this.prismaClient) {
            return this.saveObjectStorageRestoreCheckExistenceResult(record);
        }
        const row = await this.saveObjectStorageRestoreCheckRow("existence", record, {
            exists: record.exists
        });
        return toObjectStorageRestoreCheckExistenceResult(row);
    }
    async listObjectStorageRestoreCheckChecksumResultsAsync(filters = {}) {
        const rows = await this.listObjectStorageRestoreCheckRows("checksum", filters);
        return rows.map(toObjectStorageRestoreCheckChecksumResult);
    }
    async saveObjectStorageRestoreCheckChecksumResultAsync(record) {
        if (!this.prismaClient) {
            return this.saveObjectStorageRestoreCheckChecksumResult(record);
        }
        const row = await this.saveObjectStorageRestoreCheckRow("checksum", record, {
            actualChecksum: record.actualChecksum,
            expectedChecksum: record.expectedChecksum
        });
        return toObjectStorageRestoreCheckChecksumResult(row);
    }
    async listObjectStorageRestoreCheckMetadataResultsAsync(filters = {}) {
        const rows = await this.listObjectStorageRestoreCheckRows("metadata", filters);
        return rows.map(toObjectStorageRestoreCheckMetadataResult);
    }
    async saveObjectStorageRestoreCheckMetadataResultAsync(record) {
        if (!this.prismaClient) {
            return this.saveObjectStorageRestoreCheckMetadataResult(record);
        }
        const row = await this.saveObjectStorageRestoreCheckRow("metadata", record, {
            actualMetadata: record.actualMetadata,
            expectedMetadata: record.expectedMetadata
        });
        return toObjectStorageRestoreCheckMetadataResult(row);
    }
    findLoadTestIdempotencyKey(key) {
        return clone(this.readState().loadTestIdempotencyKeys.find((item) => item.key === key));
    }
    saveLoadTestIdempotencyKey(record) {
        return this.saveIdempotencyKey("loadTestIdempotencyKeys", record);
    }
    saveLoadTestRun(record) {
        this.assertSyncRuntimeAvailable();
        const persisted = clone(record);
        this.store.update((state) => {
            const current = normalizeState(state);
            const runId = String(persisted.run.id ?? "");
            const exists = current.loadTestRuns.some((item) => item.run.id === runId);
            return {
                ...current,
                loadTestRuns: exists
                    ? current.loadTestRuns.map((item) => item.run.id === runId ? persisted : item)
                    : [persisted, ...current.loadTestRuns]
            };
        });
        return clone(persisted);
    }
    findRestoreCheckIdempotencyKey(key) {
        return clone(this.readState().restoreCheckIdempotencyKeys.find((item) => item.key === key));
    }
    saveRestoreCheckIdempotencyKey(record) {
        return this.saveIdempotencyKey("restoreCheckIdempotencyKeys", record);
    }
    saveRestoreCheck(record) {
        this.assertSyncRuntimeAvailable();
        const persisted = clone(record);
        this.store.update((state) => {
            const current = normalizeState(state);
            const checkId = String(persisted.restoreCheck.id ?? "");
            const exists = current.restoreChecks.some((item) => item.restoreCheck.id === checkId);
            return {
                ...current,
                restoreChecks: exists
                    ? current.restoreChecks.map((item) => item.restoreCheck.id === checkId ? persisted : item)
                    : [persisted, ...current.restoreChecks]
            };
        });
        return clone(persisted);
    }
    findDeadLetterReplayIdempotencyKey(key) {
        return clone(this.readState().deadLetterReplayIdempotencyKeys.find((item) => item.key === key));
    }
    saveDeadLetterReplayIdempotencyKey(record) {
        return this.saveIdempotencyKey("deadLetterReplayIdempotencyKeys", record);
    }
    saveDeadLetterReplay(record) {
        this.assertSyncRuntimeAvailable();
        const persisted = clone(record);
        this.store.update((state) => {
            const current = normalizeState(state);
            const replayId = String(persisted.replay.id ?? "");
            const exists = current.deadLetterReplays.some((item) => item.replay.id === replayId);
            return {
                ...current,
                deadLetterReplays: exists
                    ? current.deadLetterReplays.map((item) => item.replay.id === replayId ? persisted : item)
                    : [persisted, ...current.deadLetterReplays]
            };
        });
        return clone(persisted);
    }
    saveDeadLetterReplayValidationDenial(record) {
        this.assertSyncRuntimeAvailable();
        const persisted = clone(record);
        this.store.update((state) => {
            const current = normalizeState(state);
            return {
                ...current,
                deadLetterReplayValidationDenials: [persisted, ...current.deadLetterReplayValidationDenials]
            };
        });
        return clone(persisted);
    }
    listDeadLetterReplayValidationDenials(filters = {}) {
        return this.readState().deadLetterReplayValidationDenials
            .filter((item) => !filters.messageId || item.messageId === filters.messageId)
            .map(clone);
    }
    saveDeadLetterReplayRequeueAudit(record) {
        this.assertSyncRuntimeAvailable();
        const persisted = clone(record);
        this.store.update((state) => {
            const current = normalizeState(state);
            return {
                ...current,
                deadLetterReplayRequeueAudits: [persisted, ...current.deadLetterReplayRequeueAudits]
            };
        });
        return clone(persisted);
    }
    listDeadLetterReplayRequeueAudits(filters = {}) {
        return this.readState().deadLetterReplayRequeueAudits
            .filter((item) => !filters.messageId || item.messageId === filters.messageId)
            .map(clone);
    }
    saveMigrationRollbackCheck(record) {
        this.assertSyncRuntimeAvailable();
        const persisted = clone(record);
        this.store.update((state) => {
            const current = normalizeState(state);
            return {
                ...current,
                migrationRollbackChecks: [persisted, ...current.migrationRollbackChecks]
            };
        });
        return clone(persisted);
    }
    findMigrationRollbackCheckResult(resultId) {
        return clone(this.readState().migrationRollbackCheckResults.find((item) => item.id === resultId));
    }
    listMigrationRollbackCheckResults(filters = {}) {
        return this.readState().migrationRollbackCheckResults
            .filter((item) => !filters.migrationId || item.migrationId === filters.migrationId)
            .map(clone);
    }
    saveMigrationRollbackCheckResult(record) {
        this.assertSyncRuntimeAvailable();
        const persisted = clone(record);
        this.store.update((state) => {
            const current = normalizeState(state);
            const exists = current.migrationRollbackCheckResults.some((item) => item.id === persisted.id);
            return {
                ...current,
                migrationRollbackCheckResults: exists
                    ? current.migrationRollbackCheckResults.map((item) => item.id === persisted.id ? persisted : item)
                    : [persisted, ...current.migrationRollbackCheckResults]
            };
        });
        return clone(persisted);
    }
    listLoadTestRunExecutions(filters = {}) {
        return this.readState().loadTestRunExecutions
            .filter((item) => !filters.status || item.status === filters.status)
            .map(clone);
    }
    findLoadTestRunExecution(runId) {
        return clone(this.readState().loadTestRunExecutions.find((item) => item.runId === runId));
    }
    saveLoadTestRunExecution(record) {
        this.assertSyncRuntimeAvailable();
        const persisted = clone(record);
        this.store.update((state) => {
            const current = normalizeState(state);
            const exists = current.loadTestRunExecutions.some((item) => item.runId === persisted.runId);
            return {
                ...current,
                loadTestRunExecutions: exists
                    ? current.loadTestRunExecutions.map((item) => item.runId === persisted.runId ? persisted : item)
                    : [persisted, ...current.loadTestRunExecutions]
            };
        });
        return clone(persisted);
    }
    findLoadTestRunMetrics(runId) {
        return clone(this.readState().loadTestRunMetrics.find((item) => item.runId === runId));
    }
    saveLoadTestRunMetrics(record) {
        this.assertSyncRuntimeAvailable();
        const persisted = clone(record);
        this.store.update((state) => {
            const current = normalizeState(state);
            const exists = current.loadTestRunMetrics.some((item) => item.runId === persisted.runId);
            return {
                ...current,
                loadTestRunMetrics: exists
                    ? current.loadTestRunMetrics.map((item) => item.runId === persisted.runId ? persisted : item)
                    : [persisted, ...current.loadTestRunMetrics]
            };
        });
        return clone(persisted);
    }
    findLoadTestRunErrorSummary(runId) {
        return clone(this.readState().loadTestRunErrorSummaries.find((item) => item.runId === runId));
    }
    saveLoadTestRunErrorSummary(record) {
        this.assertSyncRuntimeAvailable();
        const persisted = clone(record);
        this.store.update((state) => {
            const current = normalizeState(state);
            const exists = current.loadTestRunErrorSummaries.some((item) => item.runId === persisted.runId);
            return {
                ...current,
                loadTestRunErrorSummaries: exists
                    ? current.loadTestRunErrorSummaries.map((item) => item.runId === persisted.runId ? persisted : item)
                    : [persisted, ...current.loadTestRunErrorSummaries]
            };
        });
        return clone(persisted);
    }
    findPostgresRestoreCheckResult(resultId) {
        return clone(this.readState().postgresRestoreCheckResults.find((item) => item.id === resultId));
    }
    listPostgresRestoreCheckResults(filters = {}) {
        return this.readState().postgresRestoreCheckResults
            .filter((item) => !filters.drillId || item.drillId === filters.drillId)
            .filter((item) => !filters.restoreCheckId || item.restoreCheckId === filters.restoreCheckId)
            .map(clone);
    }
    savePostgresRestoreCheckResult(record) {
        this.assertSyncRuntimeAvailable();
        const persisted = clone(record);
        this.store.update((state) => {
            const current = normalizeState(state);
            const exists = current.postgresRestoreCheckResults.some((item) => item.id === persisted.id);
            return {
                ...current,
                postgresRestoreCheckResults: exists
                    ? current.postgresRestoreCheckResults.map((item) => item.id === persisted.id ? persisted : item)
                    : [persisted, ...current.postgresRestoreCheckResults]
            };
        });
        return clone(persisted);
    }
    listObjectStorageRestoreCheckExistenceResults(filters = {}) {
        return this.readState().objectStorageRestoreCheckExistenceResults
            .filter((item) => !filters.artifactId || item.artifactId === filters.artifactId)
            .filter((item) => !filters.drillId || item.drillId === filters.drillId)
            .map(clone);
    }
    saveObjectStorageRestoreCheckExistenceResult(record) {
        return this.saveObjectStorageRestoreCheckResult("objectStorageRestoreCheckExistenceResults", record);
    }
    listObjectStorageRestoreCheckChecksumResults(filters = {}) {
        return this.readState().objectStorageRestoreCheckChecksumResults
            .filter((item) => !filters.artifactId || item.artifactId === filters.artifactId)
            .filter((item) => !filters.drillId || item.drillId === filters.drillId)
            .map(clone);
    }
    saveObjectStorageRestoreCheckChecksumResult(record) {
        return this.saveObjectStorageRestoreCheckResult("objectStorageRestoreCheckChecksumResults", record);
    }
    listObjectStorageRestoreCheckMetadataResults(filters = {}) {
        return this.readState().objectStorageRestoreCheckMetadataResults
            .filter((item) => !filters.artifactId || item.artifactId === filters.artifactId)
            .filter((item) => !filters.drillId || item.drillId === filters.drillId)
            .map(clone);
    }
    saveObjectStorageRestoreCheckMetadataResult(record) {
        return this.saveObjectStorageRestoreCheckResult("objectStorageRestoreCheckMetadataResults", record);
    }
    readCatalogState() {
        return this.prismaClient ? normalizeState(this.store.read()) : this.readState();
    }
    assertSyncRuntimeAvailable() {
        if (this.prismaClient) {
            throw new Error("prisma_operations_async_required");
        }
    }
    async findRuntimeRecord(collection, entityKey) {
        if (!this.prismaClient) {
            return clone(this.readState()[collection].find((item) => runtimeEntityKey(collection, item) === entityKey));
        }
        const row = await this.prismaClient.operationsRuntimeRecord.findUnique({
            where: {
                collection_entityKey: {
                    collection,
                    entityKey
                }
            }
        });
        return row ? clone(row.record) : undefined;
    }
    async listRuntimeRecords(collection, filters = {}) {
        if (!this.prismaClient) {
            return this.readState()[collection]
                .filter((item) => !filters.filterKey || runtimeFilterKey(collection, item) === filters.filterKey)
                .map(clone);
        }
        const rows = await this.prismaClient.operationsRuntimeRecord.findMany({
            orderBy: { updatedAt: "desc" },
            where: {
                collection,
                ...(filters.filterKey ? { filterKey: filters.filterKey } : {})
            }
        });
        return rows.map((row) => clone(row.record));
    }
    async saveRuntimeRecord(collection, entityKey, record, filterKey = null) {
        if (!this.prismaClient) {
            return this.saveRuntimeRecordSynchronously(collection, record);
        }
        const persisted = clone(record);
        const now = new Date();
        const normalizedEntityKey = entityKey || runtimeRecordId(collection, JSON.stringify(persisted));
        const row = await this.prismaClient.operationsRuntimeRecord.upsert({
            create: {
                collection,
                createdAt: now,
                entityKey: normalizedEntityKey,
                filterKey,
                id: runtimeRecordId(collection, normalizedEntityKey),
                record: persisted,
                updatedAt: now
            },
            update: {
                filterKey,
                record: persisted,
                updatedAt: now
            },
            where: {
                collection_entityKey: {
                    collection,
                    entityKey: normalizedEntityKey
                }
            }
        });
        return clone(row.record);
    }
    saveRuntimeRecordSynchronously(collection, record) {
        switch (collection) {
            case "deadLetterReplayIdempotencyKeys":
                return this.saveDeadLetterReplayIdempotencyKey(record);
            case "deadLetterReplayRequeueAudits":
                return this.saveDeadLetterReplayRequeueAudit(record);
            case "deadLetterReplayValidationDenials":
                return this.saveDeadLetterReplayValidationDenial(record);
            case "deadLetterReplays":
                return this.saveDeadLetterReplay(record);
            case "loadTestIdempotencyKeys":
                return this.saveLoadTestIdempotencyKey(record);
            case "loadTestRunErrorSummaries":
                return this.saveLoadTestRunErrorSummary(record);
            case "loadTestRunExecutions":
                return this.saveLoadTestRunExecution(record);
            case "loadTestRunMetrics":
                return this.saveLoadTestRunMetrics(record);
            case "loadTestRuns":
                return this.saveLoadTestRun(record);
            case "migrationRollbackCheckResults":
                return this.saveMigrationRollbackCheckResult(record);
            case "migrationRollbackChecks":
                return this.saveMigrationRollbackCheck(record);
            case "restoreCheckIdempotencyKeys":
                return this.saveRestoreCheckIdempotencyKey(record);
            case "restoreChecks":
                return this.saveRestoreCheck(record);
        }
        throw new Error(`operations_runtime_collection_unsupported:${collection}`);
    }
    async saveIdempotencyKeyAsync(collection, record) {
        if (!this.prismaClient) {
            return this.saveIdempotencyKey(collection, record);
        }
        const existing = await this.findRuntimeRecord(collection, record.key);
        if (existing) {
            return existing;
        }
        return this.saveRuntimeRecord(collection, record.key, record);
    }
    async listObjectStorageRestoreCheckRows(checkKind, filters = {}) {
        if (!this.prismaClient) {
            const rows = checkKind === "existence"
                ? this.listObjectStorageRestoreCheckExistenceResults(filters).map((record) => toPrismaObjectStorageRestoreCheckResultRow("existence", record, { exists: record.exists }))
                : checkKind === "checksum"
                    ? this.listObjectStorageRestoreCheckChecksumResults(filters).map((record) => toPrismaObjectStorageRestoreCheckResultRow("checksum", record, {
                        actualChecksum: record.actualChecksum,
                        expectedChecksum: record.expectedChecksum
                    }))
                    : this.listObjectStorageRestoreCheckMetadataResults(filters).map((record) => toPrismaObjectStorageRestoreCheckResultRow("metadata", record, {
                        actualMetadata: record.actualMetadata,
                        expectedMetadata: record.expectedMetadata
                    }));
            return rows;
        }
        return this.prismaClient.operationsObjectStorageRestoreCheckResult.findMany({
            orderBy: { verifiedAt: "desc" },
            where: {
                checkKind,
                ...(filters.artifactId ? { artifactId: filters.artifactId } : {}),
                ...(filters.drillId ? { drillId: filters.drillId } : {})
            }
        });
    }
    async saveObjectStorageRestoreCheckRow(checkKind, record, detail) {
        if (!this.prismaClient) {
            return toPrismaObjectStorageRestoreCheckResultRow(checkKind, record, detail);
        }
        const data = toPrismaObjectStorageRestoreCheckResultCreateInput(checkKind, record, detail);
        return this.prismaClient.operationsObjectStorageRestoreCheckResult.upsert({
            create: data,
            update: toPrismaObjectStorageRestoreCheckResultUpdateInput(checkKind, record, detail),
            where: { id: record.id }
        });
    }
    saveObjectStorageRestoreCheckResult(collection, record) {
        this.assertSyncRuntimeAvailable();
        const persisted = clone(record);
        this.store.update((state) => {
            const current = normalizeState(state);
            const items = current[collection];
            const exists = items.some((item) => item.id === persisted.id);
            return {
                ...current,
                [collection]: exists
                    ? items.map((item) => item.id === persisted.id ? persisted : item)
                    : [persisted, ...items]
            };
        });
        return clone(persisted);
    }
    saveIdempotencyKey(collection, record) {
        this.assertSyncRuntimeAvailable();
        const persisted = clone(record);
        let saved = persisted;
        this.store.update((state) => {
            const current = normalizeState(state);
            const existing = current[collection].find((item) => item.key === persisted.key);
            if (existing) {
                saved = clone(existing);
                return current;
            }
            saved = persisted;
            return {
                ...current,
                [collection]: [...current[collection], persisted]
            };
        });
        return clone(saved);
    }
}
function assertCompletePrismaOperationsClient(client) {
    if (!client.operationsRuntimeRecord?.findMany || !client.operationsRuntimeRecord.findUnique || !client.operationsRuntimeRecord.upsert) {
        throw new Error("prisma_operations_runtime_record_delegate_required");
    }
    if (!client.operationsPostgresRestoreCheckResult?.findMany || !client.operationsPostgresRestoreCheckResult.findUnique || !client.operationsPostgresRestoreCheckResult.upsert) {
        throw new Error("prisma_operations_postgres_restore_check_result_delegate_required");
    }
    if (!client.operationsObjectStorageRestoreCheckResult?.findMany || !client.operationsObjectStorageRestoreCheckResult.findUnique || !client.operationsObjectStorageRestoreCheckResult.upsert) {
        throw new Error("prisma_operations_object_storage_restore_check_result_delegate_required");
    }
}
function appendRuntimeRecord(state, collection, record) {
    if (!isOperationsRuntimeCollection(collection)) {
        return;
    }
    state[collection].push(clone(record));
}
function isOperationsRuntimeCollection(collection) {
    return [
        "deadLetterReplayIdempotencyKeys",
        "deadLetterReplayRequeueAudits",
        "deadLetterReplayValidationDenials",
        "deadLetterReplays",
        "loadTestIdempotencyKeys",
        "loadTestRunErrorSummaries",
        "loadTestRunExecutions",
        "loadTestRunMetrics",
        "loadTestRuns",
        "migrationRollbackCheckResults",
        "migrationRollbackChecks",
        "restoreCheckIdempotencyKeys",
        "restoreChecks"
    ].includes(collection);
}
function runtimeEntityKey(collection, record) {
    const value = toJsonRecord(record);
    switch (collection) {
        case "deadLetterReplayIdempotencyKeys":
        case "loadTestIdempotencyKeys":
        case "restoreCheckIdempotencyKeys":
            return String(value.key ?? "");
        case "deadLetterReplayRequeueAudits":
        case "deadLetterReplayValidationDenials":
        case "migrationRollbackChecks":
            return String(toJsonRecord(value.auditEvent).id ?? "");
        case "deadLetterReplays":
            return String(toJsonRecord(value.replay).id ?? "");
        case "loadTestRunErrorSummaries":
        case "loadTestRunExecutions":
        case "loadTestRunMetrics":
            return String(value.runId ?? "");
        case "loadTestRuns":
            return String(toJsonRecord(value.run).id ?? "");
        case "migrationRollbackCheckResults":
            return String(value.id ?? "");
        case "restoreChecks":
            return String(toJsonRecord(value.restoreCheck).id ?? "");
    }
}
function runtimeFilterKey(collection, record) {
    const value = toJsonRecord(record);
    switch (collection) {
        case "deadLetterReplayRequeueAudits":
        case "deadLetterReplayValidationDenials":
            return String(value.messageId ?? "");
        case "loadTestRunExecutions":
            return String(value.status ?? "");
        case "migrationRollbackCheckResults":
        case "migrationRollbackChecks":
            return String(value.migrationId ?? "");
        default:
            return null;
    }
}
function runtimeRecordId(collection, entityKey) {
    return `operations_runtime_${collection}_${createHash("sha256").update(entityKey).digest("hex").slice(0, 24)}`;
}
function toPrismaPostgresRestoreCheckResultCreateInput(record) {
    return {
        command: record.command,
        drillId: record.drillId,
        durationMs: record.durationMs,
        executedAt: new Date(record.executedAt),
        id: record.id,
        outputSummary: record.outputSummary,
        restoreCheckId: record.restoreCheckId,
        status: record.status
    };
}
function toPrismaPostgresRestoreCheckResultUpdateInput(record) {
    const { id: _id, ...data } = toPrismaPostgresRestoreCheckResultCreateInput(record);
    return data;
}
function toPostgresRestoreCheckResult(row) {
    return {
        command: row.command,
        drillId: row.drillId,
        durationMs: row.durationMs,
        executedAt: toIso(row.executedAt),
        id: row.id,
        outputSummary: row.outputSummary,
        restoreCheckId: row.restoreCheckId,
        status: operationsPostgresRestoreStatus(row.status)
    };
}
function toPrismaObjectStorageRestoreCheckResultCreateInput(checkKind, record, detail) {
    return {
        artifactId: record.artifactId,
        checkKind,
        detail,
        drillId: record.drillId,
        id: record.id,
        restoreCheckId: record.restoreCheckId,
        status: record.status,
        verifiedAt: new Date(record.verifiedAt)
    };
}
function toPrismaObjectStorageRestoreCheckResultUpdateInput(checkKind, record, detail) {
    const { id: _id, ...data } = toPrismaObjectStorageRestoreCheckResultCreateInput(checkKind, record, detail);
    return data;
}
function toPrismaObjectStorageRestoreCheckResultRow(checkKind, record, detail) {
    return {
        ...toPrismaObjectStorageRestoreCheckResultCreateInput(checkKind, record, detail),
        createdAt: new Date(),
        verifiedAt: new Date(record.verifiedAt)
    };
}
function toObjectStorageRestoreCheckExistenceResult(row) {
    const detail = toJsonRecord(row.detail);
    return {
        artifactId: row.artifactId,
        drillId: row.drillId,
        exists: Boolean(detail.exists),
        id: row.id,
        restoreCheckId: row.restoreCheckId,
        status: row.status === "missing" ? "missing" : "passed",
        verifiedAt: toIso(row.verifiedAt)
    };
}
function toObjectStorageRestoreCheckChecksumResult(row) {
    const detail = toJsonRecord(row.detail);
    return {
        actualChecksum: String(detail.actualChecksum ?? ""),
        artifactId: row.artifactId,
        drillId: row.drillId,
        expectedChecksum: String(detail.expectedChecksum ?? ""),
        id: row.id,
        restoreCheckId: row.restoreCheckId,
        status: row.status === "mismatch" ? "mismatch" : "passed",
        verifiedAt: toIso(row.verifiedAt)
    };
}
function toObjectStorageRestoreCheckMetadataResult(row) {
    const detail = toJsonRecord(row.detail);
    return {
        actualMetadata: toNullableMetadata(detail.actualMetadata),
        artifactId: row.artifactId,
        drillId: row.drillId,
        expectedMetadata: toMetadata(detail.expectedMetadata),
        id: row.id,
        restoreCheckId: row.restoreCheckId,
        status: row.status === "mismatch" ? "mismatch" : "passed",
        verifiedAt: toIso(row.verifiedAt)
    };
}
function operationsPostgresRestoreStatus(status) {
    return status === "failed" || status === "timed_out" || status === "passed" ? status : "failed";
}
function toNullableMetadata(value) {
    return value === null || value === undefined ? null : toMetadata(value);
}
function toMetadata(value) {
    const record = toJsonRecord(value);
    return {
        backupLabel: String(record.backupLabel ?? ""),
        contentType: String(record.contentType ?? ""),
        schemaVersion: String(record.schemaVersion ?? ""),
        sizeBytes: Number(record.sizeBytes ?? 0)
    };
}
function toIso(value) {
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
function toJsonRecord(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
export function createEmptyOperationsState() {
    return {
        backupDrills: [],
        deadLetterMessages: [],
        deadLetterQueues: [],
        deadLetterReplayIdempotencyKeys: [],
        deadLetterReplayRequeueAudits: [],
        deadLetterReplayValidationDenials: [],
        deadLetterReplays: [],
        loadTestIdempotencyKeys: [],
        loadTestRunErrorSummaries: [],
        loadTestRunExecutions: [],
        loadTestRunMetrics: [],
        loadTestRuns: [],
        loadTestScenarios: [],
        migrationCandidates: [],
        migrationRollbackCheckResults: [],
        migrationRollbackChecks: [],
        objectStorageRestoreCheckChecksumResults: [],
        objectStorageRestoreCheckExistenceResults: [],
        objectStorageRestoreCheckMetadataResults: [],
        postgresRestoreCheckResults: [],
        restoreCheckIdempotencyKeys: [],
        restoreChecks: [],
        securityControls: []
    };
}
function normalizeState(state) {
    return {
        backupDrills: state.backupDrills ?? [],
        deadLetterMessages: state.deadLetterMessages ?? [],
        deadLetterQueues: state.deadLetterQueues ?? [],
        deadLetterReplayIdempotencyKeys: state.deadLetterReplayIdempotencyKeys ?? [],
        deadLetterReplayRequeueAudits: state.deadLetterReplayRequeueAudits ?? [],
        deadLetterReplayValidationDenials: state.deadLetterReplayValidationDenials ?? [],
        deadLetterReplays: state.deadLetterReplays ?? [],
        loadTestIdempotencyKeys: state.loadTestIdempotencyKeys ?? [],
        loadTestRunErrorSummaries: state.loadTestRunErrorSummaries ?? [],
        loadTestRunExecutions: state.loadTestRunExecutions ?? [],
        loadTestRunMetrics: state.loadTestRunMetrics ?? [],
        loadTestRuns: state.loadTestRuns ?? [],
        loadTestScenarios: state.loadTestScenarios ?? [],
        migrationCandidates: state.migrationCandidates ?? [],
        migrationRollbackCheckResults: state.migrationRollbackCheckResults ?? [],
        migrationRollbackChecks: state.migrationRollbackChecks ?? [],
        objectStorageRestoreCheckChecksumResults: state.objectStorageRestoreCheckChecksumResults ?? [],
        objectStorageRestoreCheckExistenceResults: state.objectStorageRestoreCheckExistenceResults ?? [],
        objectStorageRestoreCheckMetadataResults: state.objectStorageRestoreCheckMetadataResults ?? [],
        postgresRestoreCheckResults: state.postgresRestoreCheckResults ?? [],
        restoreCheckIdempotencyKeys: state.restoreCheckIdempotencyKeys ?? [],
        restoreChecks: state.restoreChecks ?? [],
        securityControls: state.securityControls ?? []
    };
}
function clone(value) {
    if (value === undefined) {
        return value;
    }
    return JSON.parse(JSON.stringify(value));
}
//# sourceMappingURL=operations.repository.js.map