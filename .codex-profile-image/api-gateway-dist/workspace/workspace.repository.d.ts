export interface FileRecord {
    auditId: string;
    channel: string;
    checksum?: string;
    fileId: string;
    fileName: string;
    mimeType: string;
    objectKey: string;
    scanCheckedAt?: string;
    scanReason?: string;
    scanState: string;
    scanVerdict?: string;
    scanner?: string;
    sizeBytes: number;
    storageState: string;
    tenantId?: string;
}
export interface FileScanResultRecord {
    scanCheckedAt?: string;
    scanReason?: string;
    scanState: string;
    scanVerdict?: string;
    scanner?: string;
}
export interface FileScanResultIdempotencyRecord {
    fileId: string;
    fingerprint: string;
    key: string;
    result: Record<string, unknown>;
    tenantId?: string;
}
export interface ClientProfileRecord {
    channel: string;
    clientSince: string;
    device: string;
    entry: string;
    id: string;
    name: string;
    phone: string;
    previous: string[][];
    sourceProfileId: string;
    tenantId?: string;
    topic: string;
}
export interface ClientMergeEvent {
    action: string;
    candidateProfileId?: string;
    detachedProfileId?: string;
    id: string;
    immutable: true;
    mergeGraphEdge: string;
    primaryProfileId: string;
    reason?: string;
    tenantId?: string;
}
export type ClientMergeConflictState = "dismissed" | "open" | "resolved";
export interface ClientMergeConflictRecord {
    candidateProfileId: string;
    conflictingFields: string[];
    id: string;
    primaryProfileId: string;
    reason: string;
    state: ClientMergeConflictState;
    tenantId?: string;
}
export interface ClientExportJobRecord {
    auditEvent: Record<string, unknown>;
    createdAt: string;
    exportId: string;
    fileDescriptor: Record<string, unknown>;
    filters: Record<string, unknown>;
    format: string;
    itemCount: number;
    reason: string;
    segment?: Record<string, unknown>;
    sensitiveFieldsMasked: true;
    status: string;
    tenantId?: string;
}
export interface TemplateRecord {
    auditId?: string;
    channel: string;
    id: string;
    ownerId?: string | null;
    scope: string;
    tenantId: string;
    text: string;
    title: string;
    topic: string;
    updated: string;
    usage: number;
    version: number;
}
export interface TemplateVersionRecord {
    channel: string;
    id: string;
    scope: string;
    templateId: string;
    text: string;
    title: string;
    topic: string;
    updated: string;
    usage: number;
    version: number;
}
export interface TemplateAuditRecord {
    action: string;
    id: string;
    immutable: true;
    reason?: string;
    templateId: string;
    timestamp: string;
}
export interface KnowledgeArticle {
    approvalHistory: Array<Record<string, unknown>>;
    attachments: Array<Record<string, unknown>>;
    body: string;
    category: string;
    channels: string[];
    helpfulRate: number;
    id: string;
    owner: string;
    status: string;
    tenantId: string;
    title: string;
    topics: string[];
    updated: string;
    usage: number;
    version: string;
    versions: Array<Record<string, unknown>>;
    visibility: string;
}
export interface KnowledgeArticlePublicationStateRecord {
    status: string;
    updated: string;
    visibility: string;
}
export interface KnowledgeDraftVersionRecord {
    articleId: string;
    author: string;
    body: string;
    changes?: string;
    id: string;
    label: string;
    status: string;
    updated: string;
}
export interface KnowledgeDraftVersionStateRecord {
    status: string;
    updated: string;
}
export interface KnowledgeApprovalDecisionRecord {
    action: string;
    actor: string;
    articleId: string;
    draftId?: string;
    id: string;
    immutable: true;
    reason?: string;
    timestamp: string;
}
export interface WorkspaceState {
    clientExportJobs: ClientExportJobRecord[];
    clientMergeConflicts: ClientMergeConflictRecord[];
    clientMergeEvents: ClientMergeEvent[];
    clientProfiles: ClientProfileRecord[];
    fileScanResultIdempotency: FileScanResultIdempotencyRecord[];
    files: FileRecord[];
    knowledgeApprovalDecisions: KnowledgeApprovalDecisionRecord[];
    knowledgeArticles: KnowledgeArticle[];
    knowledgeDraftVersions: KnowledgeDraftVersionRecord[];
    templateAuditEvents: TemplateAuditRecord[];
    templates: TemplateRecord[];
    templateVersions: TemplateVersionRecord[];
}
export interface WorkspaceRepositoryPort {
    completeFileScanResultIdempotency(key: string, result: Record<string, unknown>): FileScanResultIdempotencyRecord | Promise<FileScanResultIdempotencyRecord | undefined> | undefined;
    findFileScanResultIdempotency(key: string, scope?: WorkspaceTenantScope): FileScanResultIdempotencyRecord | Promise<FileScanResultIdempotencyRecord | undefined> | undefined;
    findFile(fileId: string, scope?: WorkspaceTenantScope): FileRecord | Promise<FileRecord | undefined> | undefined;
    findClientProfile(sourceProfileId: string, scope?: WorkspaceTenantScope): ClientProfileRecord | Promise<ClientProfileRecord | undefined> | undefined;
    findKnowledgeApprovalDecision(articleId: string, decisionId: string, scope?: WorkspaceTenantScope): KnowledgeApprovalDecisionRecord | Promise<KnowledgeApprovalDecisionRecord | undefined> | undefined;
    findKnowledgeArticle(articleId: string, scope?: WorkspaceTenantScope): KnowledgeArticle | Promise<KnowledgeArticle | undefined> | undefined;
    findKnowledgeDraftVersion(articleId: string, draftId: string, scope?: WorkspaceTenantScope): KnowledgeDraftVersionRecord | Promise<KnowledgeDraftVersionRecord | undefined> | undefined;
    findTemplate(templateId: string, scope?: WorkspaceTenantScope): TemplateRecord | Promise<TemplateRecord | undefined> | undefined;
    findTemplateAuditEvent(auditId: string): TemplateAuditRecord | Promise<TemplateAuditRecord | undefined> | undefined;
    findTemplateVersion(templateId: string, version: number): TemplateVersionRecord | Promise<TemplateVersionRecord | undefined> | undefined;
    listFiles(scope?: WorkspaceTenantScope): FileRecord[] | Promise<FileRecord[]>;
    listClientMergeConflicts(filters?: ClientMergeConflictFilters): ClientMergeConflictRecord[] | Promise<ClientMergeConflictRecord[]>;
    listClientMergeEvents(filters?: ClientMergeEventFilters): ClientMergeEvent[] | Promise<ClientMergeEvent[]>;
    listClientExportJobs(scope?: WorkspaceTenantScope): ClientExportJobRecord[] | Promise<ClientExportJobRecord[]>;
    listClientProfiles(scope?: WorkspaceTenantScope): ClientProfileRecord[] | Promise<ClientProfileRecord[]>;
    listKnowledgeApprovalDecisions(articleId: string, scope?: WorkspaceTenantScope): KnowledgeApprovalDecisionRecord[] | Promise<KnowledgeApprovalDecisionRecord[]>;
    listKnowledgeArticles(scope?: WorkspaceTenantScope): KnowledgeArticle[] | Promise<KnowledgeArticle[]>;
    listKnowledgeDraftVersions(articleId: string, scope?: WorkspaceTenantScope): KnowledgeDraftVersionRecord[] | Promise<KnowledgeDraftVersionRecord[]>;
    listTemplateAuditEvents(templateId: string): TemplateAuditRecord[] | Promise<TemplateAuditRecord[]>;
    listTemplates(scope?: WorkspaceTenantScope): TemplateRecord[] | Promise<TemplateRecord[]>;
    listTemplateVersions(templateId: string): TemplateVersionRecord[] | Promise<TemplateVersionRecord[]>;
    saveClientMergeEvent(event: ClientMergeEvent): ClientMergeEvent | Promise<ClientMergeEvent>;
    saveClientMergeConflict(conflict: ClientMergeConflictRecord): ClientMergeConflictRecord | Promise<ClientMergeConflictRecord>;
    saveClientExportJob(job: ClientExportJobRecord): ClientExportJobRecord | Promise<ClientExportJobRecord>;
    saveClientProfile(profile: ClientProfileRecord): ClientProfileRecord | Promise<ClientProfileRecord>;
    saveFileScanResultIdempotency(record: FileScanResultIdempotencyRecord): FileScanResultIdempotencyRecord | Promise<FileScanResultIdempotencyRecord>;
    saveFile(file: FileRecord): FileRecord | Promise<FileRecord>;
    saveKnowledgeApprovalDecision(decision: KnowledgeApprovalDecisionRecord): KnowledgeApprovalDecisionRecord | Promise<KnowledgeApprovalDecisionRecord>;
    saveKnowledgeArticle(article: KnowledgeArticle): KnowledgeArticle | Promise<KnowledgeArticle>;
    saveKnowledgeDraftVersion(version: KnowledgeDraftVersionRecord): KnowledgeDraftVersionRecord | Promise<KnowledgeDraftVersionRecord>;
    saveTemplateAuditEvent(event: TemplateAuditRecord): TemplateAuditRecord | Promise<TemplateAuditRecord>;
    saveTemplate(template: TemplateRecord): TemplateRecord | Promise<TemplateRecord>;
    saveTemplateVersion(version: TemplateVersionRecord): TemplateVersionRecord | Promise<TemplateVersionRecord>;
    updateFileScanResult(fileId: string, scanResult: FileScanResultRecord): FileRecord | Promise<FileRecord | undefined> | undefined;
    updateClientMergeConflictState(conflictId: string, state: ClientMergeConflictState): ClientMergeConflictRecord | Promise<ClientMergeConflictRecord | undefined> | undefined;
    updateKnowledgeArticlePublicationState(articleId: string, state: KnowledgeArticlePublicationStateRecord): KnowledgeArticle | Promise<KnowledgeArticle | undefined> | undefined;
    updateKnowledgeDraftVersionState(articleId: string, draftId: string, state: KnowledgeDraftVersionStateRecord): KnowledgeDraftVersionRecord | Promise<KnowledgeDraftVersionRecord | undefined> | undefined;
}
export declare class TemplateOwnershipConflictError extends Error {
    readonly code = "template_tenant_mismatch";
    constructor(templateId: string);
}
interface WorkspaceTenantScope {
    tenantId?: string;
}
interface ClientMergeEventFilters extends WorkspaceTenantScope {
    candidateProfileId?: string;
    detachedProfileId?: string;
    primaryProfileId?: string;
}
interface ClientMergeConflictFilters extends WorkspaceTenantScope {
    primaryProfileId?: string;
    state?: ClientMergeConflictState;
}
export declare class WorkspaceRepository implements WorkspaceRepositoryPort {
    private readonly adapter;
    private constructor();
    static default(): WorkspaceRepository;
    static useDefault(repository: WorkspaceRepository): void;
    static inMemory(seed?: WorkspaceState): WorkspaceRepository;
    static prisma({ client, fallback }: PrismaWorkspaceRepositoryOptions): WorkspaceRepository;
    completeFileScanResultIdempotency(key: string, result: Record<string, unknown>): FileScanResultIdempotencyRecord | Promise<FileScanResultIdempotencyRecord | undefined> | undefined;
    findFileScanResultIdempotency(key: string, scope?: WorkspaceTenantScope): FileScanResultIdempotencyRecord | Promise<FileScanResultIdempotencyRecord | undefined> | undefined;
    findFile(fileId: string, scope?: WorkspaceTenantScope): FileRecord | Promise<FileRecord | undefined> | undefined;
    listFiles(scope?: WorkspaceTenantScope): FileRecord[] | Promise<FileRecord[]>;
    findClientProfile(sourceProfileId: string, scope?: WorkspaceTenantScope): ClientProfileRecord | Promise<ClientProfileRecord | undefined> | undefined;
    findKnowledgeApprovalDecision(articleId: string, decisionId: string, scope?: WorkspaceTenantScope): KnowledgeApprovalDecisionRecord | Promise<KnowledgeApprovalDecisionRecord | undefined> | undefined;
    findKnowledgeArticle(articleId: string, scope?: WorkspaceTenantScope): KnowledgeArticle | Promise<KnowledgeArticle | undefined> | undefined;
    findKnowledgeDraftVersion(articleId: string, draftId: string, scope?: WorkspaceTenantScope): KnowledgeDraftVersionRecord | Promise<KnowledgeDraftVersionRecord | undefined> | undefined;
    findTemplate(templateId: string, scope?: WorkspaceTenantScope): TemplateRecord | Promise<TemplateRecord | undefined> | undefined;
    findTemplateAuditEvent(auditId: string): TemplateAuditRecord | Promise<TemplateAuditRecord | undefined> | undefined;
    findTemplateVersion(templateId: string, version: number): TemplateVersionRecord | Promise<TemplateVersionRecord | undefined> | undefined;
    listClientMergeConflicts(filters?: ClientMergeConflictFilters): ClientMergeConflictRecord[] | Promise<ClientMergeConflictRecord[]>;
    listClientMergeEvents(filters?: ClientMergeEventFilters): ClientMergeEvent[] | Promise<ClientMergeEvent[]>;
    listClientExportJobs(scope?: WorkspaceTenantScope): ClientExportJobRecord[] | Promise<ClientExportJobRecord[]>;
    listClientProfiles(scope?: WorkspaceTenantScope): ClientProfileRecord[] | Promise<ClientProfileRecord[]>;
    listKnowledgeApprovalDecisions(articleId: string, scope?: WorkspaceTenantScope): KnowledgeApprovalDecisionRecord[] | Promise<KnowledgeApprovalDecisionRecord[]>;
    listKnowledgeArticles(scope?: WorkspaceTenantScope): KnowledgeArticle[] | Promise<KnowledgeArticle[]>;
    listKnowledgeDraftVersions(articleId: string, scope?: WorkspaceTenantScope): KnowledgeDraftVersionRecord[] | Promise<KnowledgeDraftVersionRecord[]>;
    listTemplateAuditEvents(templateId: string): TemplateAuditRecord[] | Promise<TemplateAuditRecord[]>;
    listTemplates(scope?: WorkspaceTenantScope): TemplateRecord[] | Promise<TemplateRecord[]>;
    listTemplateVersions(templateId: string): TemplateVersionRecord[] | Promise<TemplateVersionRecord[]>;
    saveClientMergeEvent(event: ClientMergeEvent): ClientMergeEvent | Promise<ClientMergeEvent>;
    saveClientMergeConflict(conflict: ClientMergeConflictRecord): ClientMergeConflictRecord | Promise<ClientMergeConflictRecord>;
    saveClientExportJob(job: ClientExportJobRecord): ClientExportJobRecord | Promise<ClientExportJobRecord>;
    saveClientProfile(profile: ClientProfileRecord): ClientProfileRecord | Promise<ClientProfileRecord>;
    saveFileScanResultIdempotency(record: FileScanResultIdempotencyRecord): FileScanResultIdempotencyRecord | Promise<FileScanResultIdempotencyRecord>;
    saveFile(file: FileRecord): FileRecord | Promise<FileRecord>;
    saveKnowledgeApprovalDecision(decision: KnowledgeApprovalDecisionRecord): KnowledgeApprovalDecisionRecord | Promise<KnowledgeApprovalDecisionRecord>;
    saveKnowledgeArticle(article: KnowledgeArticle): KnowledgeArticle | Promise<KnowledgeArticle>;
    saveKnowledgeDraftVersion(version: KnowledgeDraftVersionRecord): KnowledgeDraftVersionRecord | Promise<KnowledgeDraftVersionRecord>;
    saveTemplateAuditEvent(event: TemplateAuditRecord): TemplateAuditRecord | Promise<TemplateAuditRecord>;
    saveTemplate(template: TemplateRecord): TemplateRecord | Promise<TemplateRecord>;
    saveTemplateVersion(version: TemplateVersionRecord): TemplateVersionRecord | Promise<TemplateVersionRecord>;
    updateFileScanResult(fileId: string, scanResult: FileScanResultRecord): FileRecord | Promise<FileRecord | undefined> | undefined;
    updateClientMergeConflictState(conflictId: string, state: ClientMergeConflictState): ClientMergeConflictRecord | Promise<ClientMergeConflictRecord | undefined> | undefined;
    updateKnowledgeArticlePublicationState(articleId: string, state: KnowledgeArticlePublicationStateRecord): KnowledgeArticle | Promise<KnowledgeArticle | undefined> | undefined;
    updateKnowledgeDraftVersionState(articleId: string, draftId: string, state: KnowledgeDraftVersionStateRecord): KnowledgeDraftVersionRecord | Promise<KnowledgeDraftVersionRecord | undefined> | undefined;
}
export interface PrismaWorkspaceRepositoryOptions {
    client: PrismaWorkspaceClient;
    fallback?: WorkspaceRepositoryPort;
}
export interface PrismaWorkspaceClient {
    clientMergeConflict: {
        findMany(input: PrismaClientMergeConflictFindManyInput): Promise<PrismaClientMergeConflictRow[]>;
        update(input: PrismaClientMergeConflictUpdateInput): Promise<PrismaClientMergeConflictRow>;
        upsert(input: PrismaClientMergeConflictUpsertInput): Promise<PrismaClientMergeConflictRow>;
    };
    clientMergeEvent: {
        findUnique(input: PrismaClientMergeEventFindUniqueInput): Promise<PrismaClientMergeEventRow | null>;
        findMany(input: PrismaClientMergeEventFindManyInput): Promise<PrismaClientMergeEventRow[]>;
        upsert(input: PrismaClientMergeEventUpsertInput): Promise<PrismaClientMergeEventRow>;
    };
    clientExportJob: {
        findMany(input: PrismaClientExportJobFindManyInput): Promise<PrismaClientExportJobRow[]>;
        upsert(input: PrismaClientExportJobUpsertInput): Promise<PrismaClientExportJobRow>;
    };
    clientProfile: {
        findFirst(input: PrismaClientProfileFindFirstInput): Promise<PrismaClientProfileRow | null>;
        findMany(input: PrismaClientProfileFindManyInput): Promise<PrismaClientProfileRow[]>;
        upsert(input: PrismaClientProfileUpsertInput): Promise<PrismaClientProfileRow>;
    };
    knowledgeArticle: {
        findUnique(input: PrismaKnowledgeArticleFindUniqueInput): Promise<PrismaKnowledgeArticleRow | null>;
        findMany(input: PrismaKnowledgeArticleFindManyInput): Promise<PrismaKnowledgeArticleRow[]>;
        update(input: PrismaKnowledgeArticleUpdateStateInput): Promise<PrismaKnowledgeArticleRow>;
        upsert(input: PrismaKnowledgeArticleUpsertInput): Promise<PrismaKnowledgeArticleRow>;
    };
    knowledgeApprovalDecision: {
        findFirst(input: PrismaKnowledgeApprovalDecisionFindFirstInput): Promise<PrismaKnowledgeApprovalDecisionRow | null>;
        findMany(input: PrismaKnowledgeApprovalDecisionFindManyInput): Promise<PrismaKnowledgeApprovalDecisionRow[]>;
        upsert(input: PrismaKnowledgeApprovalDecisionUpsertInput): Promise<PrismaKnowledgeApprovalDecisionRow>;
    };
    knowledgeDraftVersion: {
        findUnique(input: PrismaKnowledgeDraftVersionFindUniqueInput): Promise<PrismaKnowledgeDraftVersionRow | null>;
        findFirst(input: PrismaKnowledgeDraftVersionFindFirstInput): Promise<PrismaKnowledgeDraftVersionRow | null>;
        findMany(input: PrismaKnowledgeDraftVersionFindManyInput): Promise<PrismaKnowledgeDraftVersionRow[]>;
        update(input: PrismaKnowledgeDraftVersionUpdateStateInput): Promise<PrismaKnowledgeDraftVersionRow>;
        upsert(input: PrismaKnowledgeDraftVersionUpsertInput): Promise<PrismaKnowledgeDraftVersionRow>;
    };
    templateRecord: {
        create(input: {
            data: PrismaTemplateRecordCreateInput;
        }): Promise<PrismaTemplateRecordRow>;
        findUnique(input: PrismaTemplateRecordFindUniqueInput): Promise<PrismaTemplateRecordRow | null>;
        findMany(input: PrismaTemplateRecordFindManyInput): Promise<PrismaTemplateRecordRow[]>;
        updateMany(input: {
            data: PrismaTemplateRecordUpdateInput;
            where: {
                id: string;
                tenantId: string;
            };
        }): Promise<{
            count: number;
        }>;
    };
    templateVersion: {
        findFirst(input: PrismaTemplateVersionFindFirstInput): Promise<PrismaTemplateVersionRow | null>;
        findMany(input: PrismaTemplateVersionFindManyInput): Promise<PrismaTemplateVersionRow[]>;
        upsert(input: PrismaTemplateVersionUpsertInput): Promise<PrismaTemplateVersionRow>;
    };
    templateAuditEvent: {
        findUnique(input: PrismaTemplateAuditEventFindUniqueInput): Promise<PrismaTemplateAuditEventRow | null>;
        findMany(input: PrismaTemplateAuditEventFindManyInput): Promise<PrismaTemplateAuditEventRow[]>;
        upsert(input: PrismaTemplateAuditEventUpsertInput): Promise<PrismaTemplateAuditEventRow>;
    };
    workspaceFileScanResultIdempotency: {
        create(input: PrismaFileScanResultIdempotencyCreateInput): Promise<PrismaFileScanResultIdempotencyRow>;
        findUnique(input: PrismaFileScanResultIdempotencyFindUniqueInput): Promise<PrismaFileScanResultIdempotencyRow | null>;
        update(input: PrismaFileScanResultIdempotencyUpdateInput): Promise<PrismaFileScanResultIdempotencyRow>;
    };
    workspaceFile: {
        findMany(input: PrismaWorkspaceFileFindManyInput): Promise<PrismaWorkspaceFileRow[]>;
        findUnique(input: PrismaWorkspaceFileFindUniqueInput): Promise<PrismaWorkspaceFileRow | null>;
        update(input: PrismaWorkspaceFileUpdateScanInput): Promise<PrismaWorkspaceFileRow>;
        upsert(input: PrismaWorkspaceFileUpsertInput): Promise<PrismaWorkspaceFileRow>;
    };
}
interface PrismaClientExportJobFindManyInput {
    orderBy: {
        createdAt: "desc";
    };
    where?: {
        tenantId?: string;
    };
}
interface PrismaClientExportJobUpsertInput {
    create: PrismaClientExportJobCreateInput;
    update: PrismaClientExportJobUpdateInput;
    where: {
        exportId: string;
    };
}
interface PrismaClientExportJobCreateInput {
    auditEvent: Record<string, unknown>;
    createdAt: Date;
    exportId: string;
    fileDescriptor: Record<string, unknown>;
    filters: Record<string, unknown>;
    format: string;
    itemCount: number;
    reason: string;
    segment: Record<string, unknown> | null;
    sensitiveFieldsMasked: boolean;
    status: string;
    tenantId: string;
}
type PrismaClientExportJobUpdateInput = Omit<PrismaClientExportJobCreateInput, "exportId">;
interface PrismaClientExportJobRow extends PrismaClientExportJobCreateInput {
    updatedAt?: Date;
}
interface PrismaClientProfileFindFirstInput {
    where: {
        sourceProfileId: string;
        tenantId?: string;
    };
}
interface PrismaClientProfileFindManyInput {
    orderBy: {
        updatedAt: "desc";
    };
    where?: {
        tenantId?: string;
    };
}
interface PrismaClientProfileUpsertInput {
    create: PrismaClientProfileCreateInput;
    update: PrismaClientProfileUpdateInput;
    where: {
        tenantId_sourceProfileId: {
            sourceProfileId: string;
            tenantId: string;
        };
    };
}
interface PrismaClientProfileCreateInput {
    channel: string;
    clientSince: string;
    device: string;
    entry: string;
    id: string;
    name: string;
    phone: string;
    previous: string[][];
    sourceProfileId: string;
    tenantId: string;
    topic: string;
}
type PrismaClientProfileUpdateInput = Omit<PrismaClientProfileCreateInput, "id" | "sourceProfileId" | "tenantId">;
interface PrismaClientProfileRow extends PrismaClientProfileCreateInput {
    createdAt?: Date;
    updatedAt?: Date;
}
interface PrismaClientMergeEventFindManyInput {
    orderBy: {
        createdAt: "asc";
    };
    where?: {
        candidateProfileId?: string;
        detachedProfileId?: string;
        primaryProfileId?: string;
        tenantId?: string;
    };
}
interface PrismaClientMergeEventFindUniqueInput {
    where: {
        id: string;
    };
}
interface PrismaClientMergeEventUpsertInput {
    create: PrismaClientMergeEventCreateInput;
    update: PrismaClientMergeEventUpdateInput;
    where: {
        id: string;
    };
}
interface PrismaClientMergeEventCreateInput {
    action: string;
    candidateProfileId: string | null;
    detachedProfileId: string | null;
    id: string;
    immutable: boolean;
    mergeGraphEdge: string;
    primaryProfileId: string;
    reason: string | null;
    tenantId: string;
}
type PrismaClientMergeEventUpdateInput = Omit<PrismaClientMergeEventCreateInput, "id">;
interface PrismaClientMergeEventRow extends PrismaClientMergeEventCreateInput {
    createdAt?: Date;
    updatedAt?: Date;
}
interface PrismaClientMergeConflictFindManyInput {
    orderBy: {
        createdAt: "asc";
    };
    where?: {
        primaryProfileId?: string;
        state?: ClientMergeConflictState;
        tenantId?: string;
    };
}
interface PrismaClientMergeConflictUpsertInput {
    create: PrismaClientMergeConflictCreateInput;
    update: PrismaClientMergeConflictUpsertUpdateInput;
    where: {
        id: string;
    };
}
interface PrismaClientMergeConflictUpdateInput {
    data: {
        state: ClientMergeConflictState;
    };
    where: {
        id: string;
    };
}
interface PrismaClientMergeConflictCreateInput {
    candidateProfileId: string;
    conflictingFields: string[];
    id: string;
    primaryProfileId: string;
    reason: string;
    state: ClientMergeConflictState;
    tenantId: string;
}
type PrismaClientMergeConflictUpsertUpdateInput = Omit<PrismaClientMergeConflictCreateInput, "id">;
interface PrismaClientMergeConflictRow extends PrismaClientMergeConflictCreateInput {
    createdAt?: Date;
    updatedAt?: Date;
}
interface PrismaKnowledgeArticleFindUniqueInput {
    where: {
        id: string;
    };
}
interface PrismaKnowledgeArticleFindManyInput {
    orderBy: {
        updatedAt: "desc";
    };
    where?: {
        tenantId?: string;
    };
}
interface PrismaKnowledgeArticleUpsertInput {
    create: PrismaKnowledgeArticleCreateInput;
    update: PrismaKnowledgeArticleUpdateInput;
    where: {
        id: string;
    };
}
interface PrismaKnowledgeArticleUpdateStateInput {
    data: {
        status: string;
        updatedAt: Date;
        visibility: string;
    };
    where: {
        id: string;
    };
}
interface PrismaKnowledgeArticleCreateInput {
    approvalHistory: Array<Record<string, unknown>>;
    attachments: Array<Record<string, unknown>>;
    body: string;
    category: string;
    channels: string[];
    helpfulRate: number;
    id: string;
    owner: string;
    status: string;
    tenantId: string;
    title: string;
    topics: string[];
    updatedAt: Date;
    usage: number;
    version: string;
    versions: Array<Record<string, unknown>>;
    visibility: string;
}
type PrismaKnowledgeArticleUpdateInput = Omit<PrismaKnowledgeArticleCreateInput, "id">;
interface PrismaKnowledgeArticleRow extends PrismaKnowledgeArticleCreateInput {
    createdAt?: Date;
}
interface PrismaKnowledgeDraftVersionFindFirstInput {
    where: {
        articleId: string;
        id: string;
    };
}
interface PrismaKnowledgeDraftVersionFindUniqueInput {
    where: {
        id: string;
    };
}
interface PrismaKnowledgeDraftVersionFindManyInput {
    orderBy: {
        updatedAt: "asc";
    };
    where: {
        articleId: string;
    };
}
interface PrismaKnowledgeDraftVersionUpsertInput {
    create: PrismaKnowledgeDraftVersionCreateInput;
    update: PrismaKnowledgeDraftVersionUpdateInput;
    where: {
        id: string;
    };
}
interface PrismaKnowledgeDraftVersionUpdateStateInput {
    data: {
        status: string;
        updatedAt: Date;
    };
    where: {
        id: string;
    };
}
interface PrismaKnowledgeDraftVersionCreateInput {
    articleId: string;
    author: string;
    body: string;
    changes: string | null;
    id: string;
    label: string;
    status: string;
    updatedAt: Date;
}
type PrismaKnowledgeDraftVersionUpdateInput = Omit<PrismaKnowledgeDraftVersionCreateInput, "id">;
interface PrismaKnowledgeDraftVersionRow extends PrismaKnowledgeDraftVersionCreateInput {
    createdAt?: Date;
}
interface PrismaKnowledgeApprovalDecisionFindFirstInput {
    where: {
        articleId: string;
        id: string;
    };
}
interface PrismaKnowledgeApprovalDecisionFindManyInput {
    orderBy: {
        timestamp: "asc";
    };
    where: {
        articleId: string;
    };
}
interface PrismaKnowledgeApprovalDecisionUpsertInput {
    create: PrismaKnowledgeApprovalDecisionCreateInput;
    update: PrismaKnowledgeApprovalDecisionUpdateInput;
    where: {
        id: string;
    };
}
interface PrismaKnowledgeApprovalDecisionCreateInput {
    action: string;
    actor: string;
    articleId: string;
    draftId: string | null;
    id: string;
    immutable: boolean;
    reason: string | null;
    timestamp: Date;
}
type PrismaKnowledgeApprovalDecisionUpdateInput = Omit<PrismaKnowledgeApprovalDecisionCreateInput, "id">;
interface PrismaKnowledgeApprovalDecisionRow extends PrismaKnowledgeApprovalDecisionCreateInput {
    createdAt?: Date;
}
interface PrismaTemplateRecordFindUniqueInput {
    where: {
        id: string;
    };
}
interface PrismaTemplateRecordFindManyInput {
    orderBy: {
        updatedAt: "desc";
    };
    where?: {
        tenantId?: string;
    };
}
interface PrismaTemplateRecordCreateInput {
    auditId: string | null;
    channel: string;
    id: string;
    ownerId: string | null;
    scope: string;
    tenantId: string;
    text: string;
    title: string;
    topic: string;
    updatedAt: Date;
    usage: number;
    version: number;
}
type PrismaTemplateRecordUpdateInput = Omit<PrismaTemplateRecordCreateInput, "id">;
interface PrismaTemplateRecordRow extends PrismaTemplateRecordCreateInput {
    createdAt?: Date;
}
interface PrismaTemplateVersionFindFirstInput {
    where: {
        templateId: string;
        version: number;
    };
}
interface PrismaTemplateVersionFindManyInput {
    orderBy: {
        version: "asc";
    };
    where: {
        templateId: string;
    };
}
interface PrismaTemplateVersionUpsertInput {
    create: PrismaTemplateVersionCreateInput;
    update: PrismaTemplateVersionUpdateInput;
    where: {
        id: string;
    };
}
interface PrismaTemplateVersionCreateInput {
    channel: string;
    id: string;
    scope: string;
    templateId: string;
    text: string;
    title: string;
    topic: string;
    updatedAt: Date;
    usage: number;
    version: number;
}
type PrismaTemplateVersionUpdateInput = Omit<PrismaTemplateVersionCreateInput, "id">;
interface PrismaTemplateVersionRow extends PrismaTemplateVersionCreateInput {
    createdAt?: Date;
}
interface PrismaTemplateAuditEventFindUniqueInput {
    where: {
        id: string;
    };
}
interface PrismaTemplateAuditEventFindManyInput {
    orderBy: {
        timestamp: "asc";
    };
    where: {
        templateId: string;
    };
}
interface PrismaTemplateAuditEventUpsertInput {
    create: PrismaTemplateAuditEventCreateInput;
    update: PrismaTemplateAuditEventUpdateInput;
    where: {
        id: string;
    };
}
interface PrismaTemplateAuditEventCreateInput {
    action: string;
    id: string;
    immutable: boolean;
    reason: string | null;
    templateId: string;
    timestamp: Date;
}
type PrismaTemplateAuditEventUpdateInput = Omit<PrismaTemplateAuditEventCreateInput, "id">;
interface PrismaTemplateAuditEventRow extends PrismaTemplateAuditEventCreateInput {
    createdAt?: Date;
}
interface PrismaFileScanResultIdempotencyCreateInput {
    data: PrismaFileScanResultIdempotencyCreateData;
}
interface PrismaFileScanResultIdempotencyCreateData {
    fileId: string;
    fingerprint: string;
    key: string;
    result: Record<string, unknown>;
}
interface PrismaFileScanResultIdempotencyFindUniqueInput {
    where: {
        key: string;
    };
}
interface PrismaFileScanResultIdempotencyUpdateInput {
    data: {
        result: Record<string, unknown>;
    };
    where: {
        key: string;
    };
}
interface PrismaFileScanResultIdempotencyRow extends PrismaFileScanResultIdempotencyCreateData {
}
interface PrismaWorkspaceFileFindUniqueInput {
    where: {
        fileId: string;
    };
}
interface PrismaWorkspaceFileFindManyInput {
    where?: {
        tenantId?: string;
    };
}
interface PrismaWorkspaceFileUpsertInput {
    create: PrismaWorkspaceFileCreateInput;
    update: PrismaWorkspaceFileUpdateInput;
    where: {
        fileId: string;
    };
}
interface PrismaWorkspaceFileUpdateScanInput {
    data: PrismaWorkspaceFileScanUpdateInput;
    where: {
        fileId: string;
    };
}
interface PrismaWorkspaceFileCreateInput {
    auditId: string;
    channel: string;
    checksum: string | null;
    fileId: string;
    fileName: string;
    mimeType: string;
    objectKey: string;
    scanCheckedAt: Date | null;
    scanReason: string | null;
    scanState: string;
    scanVerdict: string | null;
    scanner: string | null;
    sizeBytes: bigint;
    storageState: string;
    tenantId: string;
}
type PrismaWorkspaceFileUpdateInput = Omit<PrismaWorkspaceFileCreateInput, "fileId">;
interface PrismaWorkspaceFileScanUpdateInput {
    scanCheckedAt: Date | null;
    scanReason: string | null;
    scanState: string;
    scanVerdict: string | null;
    scanner: string | null;
}
interface PrismaWorkspaceFileRow extends PrismaWorkspaceFileCreateInput {
}
export declare function createEmptyWorkspaceState(): WorkspaceState;
export {};
