import { type DurableStore, InMemoryStore, JsonFileStore } from "@support-communication/database";

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

export interface TemplateRecord {
  auditId?: string;
  channel: string;
  id: string;
  scope: string;
  tenantId?: string;
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
  tenantId?: string;
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
  listClientProfiles(scope?: WorkspaceTenantScope): ClientProfileRecord[] | Promise<ClientProfileRecord[]>;
  listKnowledgeApprovalDecisions(articleId: string, scope?: WorkspaceTenantScope): KnowledgeApprovalDecisionRecord[] | Promise<KnowledgeApprovalDecisionRecord[]>;
  listKnowledgeArticles(scope?: WorkspaceTenantScope): KnowledgeArticle[] | Promise<KnowledgeArticle[]>;
  listKnowledgeDraftVersions(articleId: string, scope?: WorkspaceTenantScope): KnowledgeDraftVersionRecord[] | Promise<KnowledgeDraftVersionRecord[]>;
  listTemplateAuditEvents(templateId: string): TemplateAuditRecord[] | Promise<TemplateAuditRecord[]>;
  listTemplates(scope?: WorkspaceTenantScope): TemplateRecord[] | Promise<TemplateRecord[]>;
  listTemplateVersions(templateId: string): TemplateVersionRecord[] | Promise<TemplateVersionRecord[]>;
  saveClientMergeEvent(event: ClientMergeEvent): ClientMergeEvent | Promise<ClientMergeEvent>;
  saveClientMergeConflict(conflict: ClientMergeConflictRecord): ClientMergeConflictRecord | Promise<ClientMergeConflictRecord>;
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

interface WorkspaceRepositoryOptions {
  filePath: string;
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

type MaybePromise<T> = T | Promise<T>;
let defaultRepository: WorkspaceRepository | null = null;

export class WorkspaceRepository implements WorkspaceRepositoryPort {
  private constructor(private readonly adapter: WorkspaceRepositoryPort) {}

  static default(): WorkspaceRepository {
    defaultRepository ??= WorkspaceRepository.inMemory();
    return defaultRepository;
  }

  static useDefault(repository: WorkspaceRepository): void {
    defaultRepository = repository;
  }

  static inMemory(seed: WorkspaceState = seedWorkspaceState()): WorkspaceRepository {
    return new WorkspaceRepository(createDurableWorkspaceRepository(new InMemoryStore(seed)));
  }

  static open({ filePath }: WorkspaceRepositoryOptions): WorkspaceRepository {
    return new WorkspaceRepository(createDurableWorkspaceRepository(new JsonFileStore({ filePath, seed: seedWorkspaceState() })));
  }

  static prisma({ client, fallback }: PrismaWorkspaceRepositoryOptions): WorkspaceRepository {
    return new WorkspaceRepository(new PrismaWorkspaceRepository(client, fallback));
  }

  completeFileScanResultIdempotency(key: string, result: Record<string, unknown>): FileScanResultIdempotencyRecord | Promise<FileScanResultIdempotencyRecord | undefined> | undefined {
    return this.adapter.completeFileScanResultIdempotency(key, result);
  }

  findFileScanResultIdempotency(key: string, scope: WorkspaceTenantScope = {}): FileScanResultIdempotencyRecord | Promise<FileScanResultIdempotencyRecord | undefined> | undefined {
    return this.adapter.findFileScanResultIdempotency(key, scope);
  }

  findFile(fileId: string, scope: WorkspaceTenantScope = {}): FileRecord | Promise<FileRecord | undefined> | undefined {
    return this.adapter.findFile(fileId, scope);
  }

  listFiles(scope: WorkspaceTenantScope = {}): FileRecord[] | Promise<FileRecord[]> {
    return this.adapter.listFiles(scope);
  }

  findClientProfile(sourceProfileId: string, scope: WorkspaceTenantScope = {}): ClientProfileRecord | Promise<ClientProfileRecord | undefined> | undefined {
    return this.adapter.findClientProfile(sourceProfileId, scope);
  }

  findKnowledgeApprovalDecision(articleId: string, decisionId: string, scope: WorkspaceTenantScope = {}): KnowledgeApprovalDecisionRecord | Promise<KnowledgeApprovalDecisionRecord | undefined> | undefined {
    return this.adapter.findKnowledgeApprovalDecision(articleId, decisionId, scope);
  }

  findKnowledgeArticle(articleId: string, scope: WorkspaceTenantScope = {}): KnowledgeArticle | Promise<KnowledgeArticle | undefined> | undefined {
    return this.adapter.findKnowledgeArticle(articleId, scope);
  }

  findKnowledgeDraftVersion(articleId: string, draftId: string, scope: WorkspaceTenantScope = {}): KnowledgeDraftVersionRecord | Promise<KnowledgeDraftVersionRecord | undefined> | undefined {
    return this.adapter.findKnowledgeDraftVersion(articleId, draftId, scope);
  }

  findTemplate(templateId: string, scope: WorkspaceTenantScope = {}): TemplateRecord | Promise<TemplateRecord | undefined> | undefined {
    return this.adapter.findTemplate(templateId, scope);
  }

  findTemplateAuditEvent(auditId: string): TemplateAuditRecord | Promise<TemplateAuditRecord | undefined> | undefined {
    return this.adapter.findTemplateAuditEvent(auditId);
  }

  findTemplateVersion(templateId: string, version: number): TemplateVersionRecord | Promise<TemplateVersionRecord | undefined> | undefined {
    return this.adapter.findTemplateVersion(templateId, version);
  }

  listClientMergeConflicts(filters: ClientMergeConflictFilters = {}): ClientMergeConflictRecord[] | Promise<ClientMergeConflictRecord[]> {
    return this.adapter.listClientMergeConflicts(filters);
  }

  listClientMergeEvents(filters: ClientMergeEventFilters = {}): ClientMergeEvent[] | Promise<ClientMergeEvent[]> {
    return this.adapter.listClientMergeEvents(filters);
  }

  listClientProfiles(scope: WorkspaceTenantScope = {}): ClientProfileRecord[] | Promise<ClientProfileRecord[]> {
    return this.adapter.listClientProfiles(scope);
  }

  listKnowledgeApprovalDecisions(articleId: string, scope: WorkspaceTenantScope = {}): KnowledgeApprovalDecisionRecord[] | Promise<KnowledgeApprovalDecisionRecord[]> {
    return this.adapter.listKnowledgeApprovalDecisions(articleId, scope);
  }

  listKnowledgeArticles(scope: WorkspaceTenantScope = {}): KnowledgeArticle[] | Promise<KnowledgeArticle[]> {
    return this.adapter.listKnowledgeArticles(scope);
  }

  listKnowledgeDraftVersions(articleId: string, scope: WorkspaceTenantScope = {}): KnowledgeDraftVersionRecord[] | Promise<KnowledgeDraftVersionRecord[]> {
    return this.adapter.listKnowledgeDraftVersions(articleId, scope);
  }

  listTemplateAuditEvents(templateId: string): TemplateAuditRecord[] | Promise<TemplateAuditRecord[]> {
    return this.adapter.listTemplateAuditEvents(templateId);
  }

  listTemplates(scope: WorkspaceTenantScope = {}): TemplateRecord[] | Promise<TemplateRecord[]> {
    return this.adapter.listTemplates(scope);
  }

  listTemplateVersions(templateId: string): TemplateVersionRecord[] | Promise<TemplateVersionRecord[]> {
    return this.adapter.listTemplateVersions(templateId);
  }

  saveClientMergeEvent(event: ClientMergeEvent): ClientMergeEvent | Promise<ClientMergeEvent> {
    return this.adapter.saveClientMergeEvent(event);
  }

  saveClientMergeConflict(conflict: ClientMergeConflictRecord): ClientMergeConflictRecord | Promise<ClientMergeConflictRecord> {
    return this.adapter.saveClientMergeConflict(conflict);
  }

  saveClientProfile(profile: ClientProfileRecord): ClientProfileRecord | Promise<ClientProfileRecord> {
    return this.adapter.saveClientProfile(profile);
  }

  saveFileScanResultIdempotency(record: FileScanResultIdempotencyRecord): FileScanResultIdempotencyRecord | Promise<FileScanResultIdempotencyRecord> {
    return this.adapter.saveFileScanResultIdempotency(record);
  }

  saveFile(file: FileRecord): FileRecord | Promise<FileRecord> {
    return this.adapter.saveFile(file);
  }

  saveKnowledgeApprovalDecision(decision: KnowledgeApprovalDecisionRecord): KnowledgeApprovalDecisionRecord | Promise<KnowledgeApprovalDecisionRecord> {
    return this.adapter.saveKnowledgeApprovalDecision(decision);
  }

  saveKnowledgeArticle(article: KnowledgeArticle): KnowledgeArticle | Promise<KnowledgeArticle> {
    return this.adapter.saveKnowledgeArticle(article);
  }

  saveKnowledgeDraftVersion(version: KnowledgeDraftVersionRecord): KnowledgeDraftVersionRecord | Promise<KnowledgeDraftVersionRecord> {
    return this.adapter.saveKnowledgeDraftVersion(version);
  }

  saveTemplateAuditEvent(event: TemplateAuditRecord): TemplateAuditRecord | Promise<TemplateAuditRecord> {
    return this.adapter.saveTemplateAuditEvent(event);
  }

  saveTemplate(template: TemplateRecord): TemplateRecord | Promise<TemplateRecord> {
    return this.adapter.saveTemplate(template);
  }

  saveTemplateVersion(version: TemplateVersionRecord): TemplateVersionRecord | Promise<TemplateVersionRecord> {
    return this.adapter.saveTemplateVersion(version);
  }

  updateFileScanResult(fileId: string, scanResult: FileScanResultRecord): FileRecord | Promise<FileRecord | undefined> | undefined {
    return this.adapter.updateFileScanResult(fileId, scanResult);
  }

  updateClientMergeConflictState(conflictId: string, state: ClientMergeConflictState): ClientMergeConflictRecord | Promise<ClientMergeConflictRecord | undefined> | undefined {
    return this.adapter.updateClientMergeConflictState(conflictId, state);
  }

  updateKnowledgeArticlePublicationState(articleId: string, state: KnowledgeArticlePublicationStateRecord): KnowledgeArticle | Promise<KnowledgeArticle | undefined> | undefined {
    return this.adapter.updateKnowledgeArticlePublicationState(articleId, state);
  }

  updateKnowledgeDraftVersionState(articleId: string, draftId: string, state: KnowledgeDraftVersionStateRecord): KnowledgeDraftVersionRecord | Promise<KnowledgeDraftVersionRecord | undefined> | undefined {
    return this.adapter.updateKnowledgeDraftVersionState(articleId, draftId, state);
  }
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
    findUnique(input: PrismaTemplateRecordFindUniqueInput): Promise<PrismaTemplateRecordRow | null>;
    findMany(input: PrismaTemplateRecordFindManyInput): Promise<PrismaTemplateRecordRow[]>;
    upsert(input: PrismaTemplateRecordUpsertInput): Promise<PrismaTemplateRecordRow>;
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

interface PrismaClientProfileFindFirstInput {
  where: { sourceProfileId: string; tenantId?: string };
}

interface PrismaClientProfileFindManyInput {
  orderBy: { updatedAt: "desc" };
  where?: { tenantId?: string };
}

interface PrismaClientProfileUpsertInput {
  create: PrismaClientProfileCreateInput;
  update: PrismaClientProfileUpdateInput;
  where: { tenantId_sourceProfileId: { sourceProfileId: string; tenantId: string } };
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
  orderBy: { createdAt: "asc" };
  where?: {
    candidateProfileId?: string;
    detachedProfileId?: string;
    primaryProfileId?: string;
    tenantId?: string;
  };
}

interface PrismaClientMergeEventFindUniqueInput {
  where: { id: string };
}

interface PrismaClientMergeEventUpsertInput {
  create: PrismaClientMergeEventCreateInput;
  update: PrismaClientMergeEventUpdateInput;
  where: { id: string };
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
  orderBy: { createdAt: "asc" };
  where?: {
    primaryProfileId?: string;
    state?: ClientMergeConflictState;
    tenantId?: string;
  };
}

interface PrismaClientMergeConflictUpsertInput {
  create: PrismaClientMergeConflictCreateInput;
  update: PrismaClientMergeConflictUpsertUpdateInput;
  where: { id: string };
}

interface PrismaClientMergeConflictUpdateInput {
  data: { state: ClientMergeConflictState };
  where: { id: string };
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
  where: { id: string };
}

interface PrismaKnowledgeArticleFindManyInput {
  orderBy: { updatedAt: "desc" };
  where?: { tenantId?: string };
}

interface PrismaKnowledgeArticleUpsertInput {
  create: PrismaKnowledgeArticleCreateInput;
  update: PrismaKnowledgeArticleUpdateInput;
  where: { id: string };
}

interface PrismaKnowledgeArticleUpdateStateInput {
  data: {
    status: string;
    updatedAt: Date;
    visibility: string;
  };
  where: { id: string };
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
  where: { articleId: string; id: string };
}

interface PrismaKnowledgeDraftVersionFindUniqueInput {
  where: { id: string };
}

interface PrismaKnowledgeDraftVersionFindManyInput {
  orderBy: { updatedAt: "asc" };
  where: { articleId: string };
}

interface PrismaKnowledgeDraftVersionUpsertInput {
  create: PrismaKnowledgeDraftVersionCreateInput;
  update: PrismaKnowledgeDraftVersionUpdateInput;
  where: { id: string };
}

interface PrismaKnowledgeDraftVersionUpdateStateInput {
  data: {
    status: string;
    updatedAt: Date;
  };
  where: { id: string };
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
  where: { articleId: string; id: string };
}

interface PrismaKnowledgeApprovalDecisionFindManyInput {
  orderBy: { timestamp: "asc" };
  where: { articleId: string };
}

interface PrismaKnowledgeApprovalDecisionUpsertInput {
  create: PrismaKnowledgeApprovalDecisionCreateInput;
  update: PrismaKnowledgeApprovalDecisionUpdateInput;
  where: { id: string };
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
  where: { id: string };
}

interface PrismaTemplateRecordFindManyInput {
  orderBy: { updatedAt: "desc" };
  where?: { tenantId?: string };
}

interface PrismaTemplateRecordUpsertInput {
  create: PrismaTemplateRecordCreateInput;
  update: PrismaTemplateRecordUpdateInput;
  where: { id: string };
}

interface PrismaTemplateRecordCreateInput {
  auditId: string | null;
  channel: string;
  id: string;
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
  where: { templateId: string; version: number };
}

interface PrismaTemplateVersionFindManyInput {
  orderBy: { version: "asc" };
  where: { templateId: string };
}

interface PrismaTemplateVersionUpsertInput {
  create: PrismaTemplateVersionCreateInput;
  update: PrismaTemplateVersionUpdateInput;
  where: { id: string };
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
  where: { id: string };
}

interface PrismaTemplateAuditEventFindManyInput {
  orderBy: { timestamp: "asc" };
  where: { templateId: string };
}

interface PrismaTemplateAuditEventUpsertInput {
  create: PrismaTemplateAuditEventCreateInput;
  update: PrismaTemplateAuditEventUpdateInput;
  where: { id: string };
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
  where: { key: string };
}

interface PrismaFileScanResultIdempotencyUpdateInput {
  data: { result: Record<string, unknown> };
  where: { key: string };
}

interface PrismaFileScanResultIdempotencyRow extends PrismaFileScanResultIdempotencyCreateData {}

interface PrismaWorkspaceFileFindUniqueInput {
  where: { fileId: string };
}

interface PrismaWorkspaceFileFindManyInput {
  where?: { tenantId?: string };
}

interface PrismaWorkspaceFileUpsertInput {
  create: PrismaWorkspaceFileCreateInput;
  update: PrismaWorkspaceFileUpdateInput;
  where: { fileId: string };
}

interface PrismaWorkspaceFileUpdateScanInput {
  data: PrismaWorkspaceFileScanUpdateInput;
  where: { fileId: string };
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

interface PrismaWorkspaceFileRow extends PrismaWorkspaceFileCreateInput {}

class PrismaWorkspaceRepository implements WorkspaceRepositoryPort {
  private readonly fallback: WorkspaceRepositoryPort;

  constructor(private readonly client: PrismaWorkspaceClient, fallback: WorkspaceRepositoryPort = WorkspaceRepository.inMemory()) {
    this.fallback = fallback;
  }

  async completeFileScanResultIdempotency(key: string, result: Record<string, unknown>): Promise<FileScanResultIdempotencyRecord | undefined> {
    try {
      const row = await this.client.workspaceFileScanResultIdempotency.update({
        data: { result: clone(result) },
        where: { key }
      });

      return toFileScanResultIdempotencyRecord(row);
    } catch (error) {
      if (isPrismaNotFoundError(error)) {
        return undefined;
      }

      throw error;
    }
  }

  async findFileScanResultIdempotency(key: string, scope: WorkspaceTenantScope = {}): Promise<FileScanResultIdempotencyRecord | undefined> {
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

  async findFile(fileId: string, scope: WorkspaceTenantScope = {}): Promise<FileRecord | undefined> {
    const row = await this.client.workspaceFile.findUnique({ where: { fileId } });
    if (!row) {
      return undefined;
    }

    const file = toFileRecord(row);
    return scope.tenantId && file.tenantId !== scope.tenantId ? undefined : file;
  }

  async listFiles(scope: WorkspaceTenantScope = {}): Promise<FileRecord[]> {
    const rows = await this.client.workspaceFile.findMany({
      ...(scope.tenantId ? { where: { tenantId: scope.tenantId } } : {})
    });

    return rows.map(toFileRecord);
  }

  async findClientProfile(sourceProfileId: string, scope: WorkspaceTenantScope = {}): Promise<ClientProfileRecord | undefined> {
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

  async findKnowledgeArticle(articleId: string, scope: WorkspaceTenantScope = {}): Promise<KnowledgeArticle | undefined> {
    const row = await this.client.knowledgeArticle.findUnique({ where: { id: articleId } });
    return row && (!scope.tenantId || row.tenantId === scope.tenantId) ? toKnowledgeArticle(row) : undefined;
  }

  async findKnowledgeApprovalDecision(articleId: string, decisionId: string, scope: WorkspaceTenantScope = {}): Promise<KnowledgeApprovalDecisionRecord | undefined> {
    if (scope.tenantId && !await this.findKnowledgeArticle(articleId, scope)) {
      return undefined;
    }

    const row = await this.client.knowledgeApprovalDecision.findFirst({
      where: { articleId, id: decisionId }
    });

    return row ? toKnowledgeApprovalDecisionRecord(row) : undefined;
  }

  async findKnowledgeDraftVersion(articleId: string, draftId: string, scope: WorkspaceTenantScope = {}): Promise<KnowledgeDraftVersionRecord | undefined> {
    if (scope.tenantId && !await this.findKnowledgeArticle(articleId, scope)) {
      return undefined;
    }

    const row = await this.client.knowledgeDraftVersion.findFirst({
      where: { articleId, id: draftId }
    });

    return row ? toKnowledgeDraftVersionRecord(row) : undefined;
  }

  async findTemplate(templateId: string, scope: WorkspaceTenantScope = {}): Promise<TemplateRecord | undefined> {
    const row = await this.client.templateRecord.findUnique({ where: { id: templateId } });
    return row && (!scope.tenantId || row.tenantId === scope.tenantId) ? toTemplateRecord(row) : undefined;
  }

  async findTemplateAuditEvent(auditId: string): Promise<TemplateAuditRecord | undefined> {
    const row = await this.client.templateAuditEvent.findUnique({ where: { id: auditId } });
    return row ? toTemplateAuditRecord(row) : undefined;
  }

  async findTemplateVersion(templateId: string, version: number): Promise<TemplateVersionRecord | undefined> {
    const row = await this.client.templateVersion.findFirst({
      where: { templateId, version }
    });

    return row ? toTemplateVersionRecord(row) : undefined;
  }

  async listClientMergeConflicts(filters: ClientMergeConflictFilters = {}): Promise<ClientMergeConflictRecord[]> {
    const rows = await this.client.clientMergeConflict.findMany({
      orderBy: { createdAt: "asc" },
      where: clientMergeConflictWhere(filters)
    });

    return rows.map(toClientMergeConflictRecord);
  }

  async listClientMergeEvents(filters: ClientMergeEventFilters = {}): Promise<ClientMergeEvent[]> {
    const rows = await this.client.clientMergeEvent.findMany({
      orderBy: { createdAt: "asc" },
      where: clientMergeEventWhere(filters)
    });

    return rows.map(toClientMergeEvent);
  }

  async listClientProfiles(scope: WorkspaceTenantScope = {}): Promise<ClientProfileRecord[]> {
    const rows = await this.client.clientProfile.findMany({
      orderBy: { updatedAt: "desc" },
      where: scope.tenantId ? { tenantId: scope.tenantId } : undefined
    });

    return rows.map(toClientProfileRecord);
  }

  async listKnowledgeArticles(scope: WorkspaceTenantScope = {}): Promise<KnowledgeArticle[]> {
    const rows = await this.client.knowledgeArticle.findMany({
      orderBy: { updatedAt: "desc" },
      ...(scope.tenantId ? { where: { tenantId: scope.tenantId } } : {})
    });

    return rows.map(toKnowledgeArticle);
  }

  async listKnowledgeApprovalDecisions(articleId: string, scope: WorkspaceTenantScope = {}): Promise<KnowledgeApprovalDecisionRecord[]> {
    if (scope.tenantId && !await this.findKnowledgeArticle(articleId, scope)) {
      return [];
    }

    const rows = await this.client.knowledgeApprovalDecision.findMany({
      orderBy: { timestamp: "asc" },
      where: { articleId }
    });

    return rows.map(toKnowledgeApprovalDecisionRecord);
  }

  async listKnowledgeDraftVersions(articleId: string, scope: WorkspaceTenantScope = {}): Promise<KnowledgeDraftVersionRecord[]> {
    if (scope.tenantId && !await this.findKnowledgeArticle(articleId, scope)) {
      return [];
    }

    const rows = await this.client.knowledgeDraftVersion.findMany({
      orderBy: { updatedAt: "asc" },
      where: { articleId }
    });

    return rows.map(toKnowledgeDraftVersionRecord);
  }

  async listTemplateAuditEvents(templateId: string): Promise<TemplateAuditRecord[]> {
    const rows = await this.client.templateAuditEvent.findMany({
      orderBy: { timestamp: "asc" },
      where: { templateId }
    });

    return rows.map(toTemplateAuditRecord);
  }

  async listTemplates(scope: WorkspaceTenantScope = {}): Promise<TemplateRecord[]> {
    const rows = await this.client.templateRecord.findMany({
      orderBy: { updatedAt: "desc" },
      ...(scope.tenantId ? { where: { tenantId: scope.tenantId } } : {})
    });

    return rows.map(toTemplateRecord);
  }

  async listTemplateVersions(templateId: string): Promise<TemplateVersionRecord[]> {
    const rows = await this.client.templateVersion.findMany({
      orderBy: { version: "asc" },
      where: { templateId }
    });

    return rows.map(toTemplateVersionRecord);
  }

  async saveClientMergeEvent(event: ClientMergeEvent): Promise<ClientMergeEvent> {
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

    let row: PrismaClientMergeEventRow;
    try {
      row = await this.client.clientMergeEvent.upsert({
        create,
        update: toPrismaClientMergeEventUpdateInput(create),
        where: { id: event.id }
      });
    } catch (error) {
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

  async saveClientMergeConflict(conflict: ClientMergeConflictRecord): Promise<ClientMergeConflictRecord> {
    const create = toPrismaClientMergeConflictCreateInput(conflict);
    const row = await this.client.clientMergeConflict.upsert({
      create,
      update: toPrismaClientMergeConflictUpsertUpdateInput(create),
      where: { id: conflict.id }
    });

    return toClientMergeConflictRecord(row);
  }

  async saveClientProfile(profile: ClientProfileRecord): Promise<ClientProfileRecord> {
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

  async saveFileScanResultIdempotency(record: FileScanResultIdempotencyRecord): Promise<FileScanResultIdempotencyRecord> {
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
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const existing = await this.findFileScanResultIdempotency(record.key);
        if (existing) {
          return existing;
        }
      }

      throw error;
    }
  }

  async saveFile(file: FileRecord): Promise<FileRecord> {
    const create = toPrismaWorkspaceFileCreateInput(file);
    const row = await this.client.workspaceFile.upsert({
      create,
      update: toPrismaWorkspaceFileUpdateInput(create),
      where: { fileId: file.fileId }
    });

    return toFileRecord(row);
  }

  async saveKnowledgeArticle(article: KnowledgeArticle): Promise<KnowledgeArticle> {
    const create = toPrismaKnowledgeArticleCreateInput(article);
    const row = await this.client.knowledgeArticle.upsert({
      create,
      update: toPrismaKnowledgeArticleUpdateInput(create),
      where: { id: article.id }
    });

    return toKnowledgeArticle(row);
  }

  async saveKnowledgeApprovalDecision(decision: KnowledgeApprovalDecisionRecord): Promise<KnowledgeApprovalDecisionRecord> {
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

  async saveKnowledgeDraftVersion(version: KnowledgeDraftVersionRecord): Promise<KnowledgeDraftVersionRecord> {
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

  async saveTemplateAuditEvent(event: TemplateAuditRecord): Promise<TemplateAuditRecord> {
    const create = toPrismaTemplateAuditEventCreateInput(event);
    const row = await this.client.templateAuditEvent.upsert({
      create,
      update: toPrismaTemplateAuditEventUpdateInput(create),
      where: { id: event.id }
    });

    return toTemplateAuditRecord(row);
  }

  async saveTemplate(template: TemplateRecord): Promise<TemplateRecord> {
    const create = toPrismaTemplateRecordCreateInput(template);
    const row = await this.client.templateRecord.upsert({
      create,
      update: toPrismaTemplateRecordUpdateInput(create),
      where: { id: template.id }
    });

    return toTemplateRecord(row);
  }

  async saveTemplateVersion(version: TemplateVersionRecord): Promise<TemplateVersionRecord> {
    const create = toPrismaTemplateVersionCreateInput(version);
    const row = await this.client.templateVersion.upsert({
      create,
      update: toPrismaTemplateVersionUpdateInput(create),
      where: { id: version.id }
    });

    return toTemplateVersionRecord(row);
  }

  async updateFileScanResult(fileId: string, scanResult: FileScanResultRecord): Promise<FileRecord | undefined> {
    try {
      const row = await this.client.workspaceFile.update({
        data: toPrismaWorkspaceFileScanUpdateInput(scanResult),
        where: { fileId }
      });

      return toFileRecord(row);
    } catch (error) {
      if (isPrismaNotFoundError(error)) {
        return undefined;
      }

      throw error;
    }
  }

  async updateClientMergeConflictState(conflictId: string, state: ClientMergeConflictState): Promise<ClientMergeConflictRecord | undefined> {
    const nextState = parseClientMergeConflictState(state);
    try {
      const row = await this.client.clientMergeConflict.update({
        data: { state: nextState },
        where: { id: conflictId }
      });

      return toClientMergeConflictRecord(row);
    } catch (error) {
      if (isPrismaNotFoundError(error)) {
        return undefined;
      }

      throw error;
    }
  }

  async updateKnowledgeArticlePublicationState(articleId: string, state: KnowledgeArticlePublicationStateRecord): Promise<KnowledgeArticle | undefined> {
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
    } catch (error) {
      if (isPrismaNotFoundError(error)) {
        return undefined;
      }

      throw error;
    }
  }

  async updateKnowledgeDraftVersionState(_articleId: string, draftId: string, state: KnowledgeDraftVersionStateRecord): Promise<KnowledgeDraftVersionRecord | undefined> {
    try {
      const row = await this.client.knowledgeDraftVersion.update({
        data: {
          status: state.status,
          updatedAt: new Date(state.updated)
        },
        where: { id: draftId }
      });

      return toKnowledgeDraftVersionRecord(row);
    } catch (error) {
      if (isPrismaNotFoundError(error)) {
        return undefined;
      }

      throw error;
    }
  }
}

function createDurableWorkspaceRepository(store: DurableStore<WorkspaceState>): WorkspaceRepositoryPort {
  return {
    completeFileScanResultIdempotency(key: string, result: Record<string, unknown>): FileScanResultIdempotencyRecord | undefined {
      let persisted: FileScanResultIdempotencyRecord | undefined;
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

    findFileScanResultIdempotency(key: string, scope: WorkspaceTenantScope = {}): FileScanResultIdempotencyRecord | undefined {
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

    findFile(fileId: string, scope: WorkspaceTenantScope = {}): FileRecord | undefined {
      const file = readState(store).files.find((item) => item.fileId === fileId);
      return !file || scope.tenantId && file.tenantId !== scope.tenantId ? undefined : clone(file);
    },

    listFiles(scope: WorkspaceTenantScope = {}): FileRecord[] {
      return clone(readState(store).files.filter((file) => !scope.tenantId || file.tenantId === scope.tenantId));
    },

    findClientProfile(sourceProfileId: string, scope: WorkspaceTenantScope = {}): ClientProfileRecord | undefined {
      if (!scope.tenantId) {
        return undefined;
      }

      return clone(readState(store).clientProfiles.find((profile) =>
        profile.sourceProfileId === sourceProfileId && isClientProfileInScope(profile, scope)
      ));
    },

    findKnowledgeArticle(articleId: string, scope: WorkspaceTenantScope = {}): KnowledgeArticle | undefined {
      return clone(readState(store).knowledgeArticles.find((article) => article.id === articleId && isKnowledgeArticleInScope(article, scope)));
    },

    findKnowledgeApprovalDecision(articleId: string, decisionId: string, scope: WorkspaceTenantScope = {}): KnowledgeApprovalDecisionRecord | undefined {
      const current = readState(store);
      if (scope.tenantId && !current.knowledgeArticles.some((article) => article.id === articleId && isKnowledgeArticleInScope(article, scope))) {
        return undefined;
      }

      return clone(readState(store).knowledgeApprovalDecisions.find((decision) => decision.articleId === articleId && decision.id === decisionId));
    },

    findKnowledgeDraftVersion(articleId: string, draftId: string, scope: WorkspaceTenantScope = {}): KnowledgeDraftVersionRecord | undefined {
      const current = readState(store);
      if (scope.tenantId && !current.knowledgeArticles.some((article) => article.id === articleId && isKnowledgeArticleInScope(article, scope))) {
        return undefined;
      }

      return clone(readState(store).knowledgeDraftVersions.find((version) => version.articleId === articleId && version.id === draftId));
    },

    findTemplate(templateId: string, scope: WorkspaceTenantScope = {}): TemplateRecord | undefined {
      return clone(readState(store).templates.find((template) => template.id === templateId && isTemplateInScope(template, scope)));
    },

    findTemplateAuditEvent(auditId: string): TemplateAuditRecord | undefined {
      return clone(readState(store).templateAuditEvents.find((event) => event.id === auditId));
    },

    findTemplateVersion(templateId: string, version: number): TemplateVersionRecord | undefined {
      return clone(readState(store).templateVersions.find((item) => item.templateId === templateId && item.version === version));
    },

    listClientMergeConflicts(filters: ClientMergeConflictFilters = {}): ClientMergeConflictRecord[] {
      return clone(readState(store).clientMergeConflicts.filter((conflict) => isClientMergeConflictInScope(conflict, filters)));
    },

    listClientMergeEvents(filters: ClientMergeEventFilters = {}): ClientMergeEvent[] {
      return clone(readState(store).clientMergeEvents.filter((event) => isClientMergeEventInScope(event, filters)));
    },

    listClientProfiles(scope: WorkspaceTenantScope = {}): ClientProfileRecord[] {
      return clone(readState(store).clientProfiles.filter((profile) => isClientProfileInScope(profile, scope)));
    },

    listKnowledgeArticles(scope: WorkspaceTenantScope = {}): KnowledgeArticle[] {
      return clone(readState(store).knowledgeArticles.filter((article) => isKnowledgeArticleInScope(article, scope)));
    },

    listKnowledgeApprovalDecisions(articleId: string, scope: WorkspaceTenantScope = {}): KnowledgeApprovalDecisionRecord[] {
      const current = readState(store);
      if (scope.tenantId && !current.knowledgeArticles.some((article) => article.id === articleId && isKnowledgeArticleInScope(article, scope))) {
        return [];
      }

      return clone(current.knowledgeApprovalDecisions.filter((decision) => decision.articleId === articleId));
    },

    listKnowledgeDraftVersions(articleId: string, scope: WorkspaceTenantScope = {}): KnowledgeDraftVersionRecord[] {
      const current = readState(store);
      if (scope.tenantId && !current.knowledgeArticles.some((article) => article.id === articleId && isKnowledgeArticleInScope(article, scope))) {
        return [];
      }

      return clone(current.knowledgeDraftVersions.filter((version) => version.articleId === articleId));
    },

    listTemplates(scope: WorkspaceTenantScope = {}): TemplateRecord[] {
      return clone(readState(store).templates.filter((template) => isTemplateInScope(template, scope)));
    },

    listTemplateAuditEvents(templateId: string): TemplateAuditRecord[] {
      return clone(readState(store).templateAuditEvents.filter((event) => event.templateId === templateId));
    },

    listTemplateVersions(templateId: string): TemplateVersionRecord[] {
      return clone(readState(store).templateVersions
        .filter((version) => version.templateId === templateId)
        .sort((left, right) => left.version - right.version));
    },

    saveClientMergeEvent(event: ClientMergeEvent): ClientMergeEvent {
      let persisted: ClientMergeEvent | null = null;
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

    saveClientMergeConflict(conflict: ClientMergeConflictRecord): ClientMergeConflictRecord {
      let persisted: ClientMergeConflictRecord | null = null;
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

    saveClientProfile(profile: ClientProfileRecord): ClientProfileRecord {
      let persisted: ClientProfileRecord | null = null;
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

    saveFileScanResultIdempotency(record: FileScanResultIdempotencyRecord): FileScanResultIdempotencyRecord {
      let persisted: FileScanResultIdempotencyRecord | null = null;
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

    saveFile(file: FileRecord): FileRecord {
      let persisted: FileRecord | null = null;
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

    saveKnowledgeArticle(article: KnowledgeArticle): KnowledgeArticle {
      let persisted: KnowledgeArticle | null = null;
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

    saveKnowledgeApprovalDecision(decision: KnowledgeApprovalDecisionRecord): KnowledgeApprovalDecisionRecord {
      let persisted: KnowledgeApprovalDecisionRecord | null = null;
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

    saveKnowledgeDraftVersion(version: KnowledgeDraftVersionRecord): KnowledgeDraftVersionRecord {
      let persisted: KnowledgeDraftVersionRecord | null = null;
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

    saveTemplate(template: TemplateRecord): TemplateRecord {
      let persisted: TemplateRecord | null = null;
      store.update((state) => {
        const current = normalizeState(state);
        const nextTemplate = clone(template);
        persisted = nextTemplate;
        const exists = current.templates.some((item) => item.id === nextTemplate.id);

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

    saveTemplateAuditEvent(event: TemplateAuditRecord): TemplateAuditRecord {
      let persisted: TemplateAuditRecord | null = null;
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

    saveTemplateVersion(version: TemplateVersionRecord): TemplateVersionRecord {
      let persisted: TemplateVersionRecord | null = null;
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

    updateFileScanResult(fileId: string, scanResult: FileScanResultRecord): FileRecord | undefined {
      let persisted: FileRecord | undefined;
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

    updateClientMergeConflictState(conflictId: string, state: ClientMergeConflictState): ClientMergeConflictRecord | undefined {
      const nextState = parseClientMergeConflictState(state);
      let persisted: ClientMergeConflictRecord | undefined;
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

    updateKnowledgeArticlePublicationState(articleId: string, state: KnowledgeArticlePublicationStateRecord): KnowledgeArticle | undefined {
      let persisted: KnowledgeArticle | undefined;
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
          knowledgeArticles: current.knowledgeArticles.map((article) =>
            isSameKnowledgeArticleIdentity(article, nextArticle) ? nextArticle : article
          )
        };
      });

      return clone(persisted);
    },

    updateKnowledgeDraftVersionState(articleId: string, draftId: string, state: KnowledgeDraftVersionStateRecord): KnowledgeDraftVersionRecord | undefined {
      let persisted: KnowledgeDraftVersionRecord | undefined;
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
          knowledgeDraftVersions: current.knowledgeDraftVersions.map((version) =>
            version.articleId === articleId && version.id === draftId ? nextVersion : version
          )
        };
      });

      return clone(persisted);
    }
  };
}

function seedWorkspaceState(): WorkspaceState {
  return {
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

function normalizeState(state: Partial<WorkspaceState>): WorkspaceState {
  return {
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

function readState(store: DurableStore<WorkspaceState>): WorkspaceState {
  return normalizeState(store.read());
}

function isClientProfileInScope(profile: ClientProfileRecord, scope: WorkspaceTenantScope): boolean {
  return !scope.tenantId || profile.tenantId === scope.tenantId;
}

function isTemplateInScope(template: TemplateRecord, scope: WorkspaceTenantScope): boolean {
  return !scope.tenantId || (template.tenantId ?? "tenant-volga") === scope.tenantId;
}

function isKnowledgeArticleInScope(article: KnowledgeArticle, scope: WorkspaceTenantScope): boolean {
  return !scope.tenantId || (article.tenantId ?? "tenant-volga") === scope.tenantId;
}

function isClientMergeEventInScope(event: ClientMergeEvent, filters: ClientMergeEventFilters): boolean {
  return (!filters.tenantId || event.tenantId === filters.tenantId)
    && (!filters.primaryProfileId || event.primaryProfileId === filters.primaryProfileId)
    && (!filters.candidateProfileId || event.candidateProfileId === filters.candidateProfileId)
    && (!filters.detachedProfileId || event.detachedProfileId === filters.detachedProfileId);
}

function resolveClientMergeEventReplay(existingEvents: ClientMergeEvent[], nextEvent: ClientMergeEvent): ClientMergeEvent | undefined {
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

function isClientMergeConflictInScope(conflict: ClientMergeConflictRecord, filters: ClientMergeConflictFilters): boolean {
  return (!filters.tenantId || conflict.tenantId === filters.tenantId)
    && (!filters.primaryProfileId || conflict.primaryProfileId === filters.primaryProfileId)
    && (!filters.state || conflict.state === filters.state);
}

function isSameClientProfileIdentity(left: ClientProfileRecord, right: ClientProfileRecord): boolean {
  return left.sourceProfileId === right.sourceProfileId
    && (left.tenantId ?? null) === (right.tenantId ?? null);
}

function isSameTemplateVersion(left: TemplateVersionRecord, right: TemplateVersionRecord): boolean {
  return left.templateId === right.templateId
    && left.version === right.version;
}

function isSameKnowledgeArticleIdentity(left: KnowledgeArticle, right: KnowledgeArticle): boolean {
  return left.id === right.id
    && (left.tenantId ?? "tenant-volga") === (right.tenantId ?? "tenant-volga");
}

function isDuplicateKnowledgeDraftVersionReplay(left: KnowledgeDraftVersionRecord, right: KnowledgeDraftVersionRecord): boolean {
  return left.articleId === right.articleId
    && left.id === right.id
    && left.author === right.author
    && left.body === right.body
    && (left.changes ?? null) === (right.changes ?? null)
    && left.label === right.label
    && left.status === right.status;
}

function isDuplicateKnowledgeApprovalDecisionReplay(left: KnowledgeApprovalDecisionRecord, right: KnowledgeApprovalDecisionRecord): boolean {
  return left.articleId === right.articleId
    && left.id === right.id
    && left.action === right.action
    && left.actor === right.actor
    && (left.draftId ?? null) === (right.draftId ?? null)
    && left.immutable === right.immutable
    && (left.reason ?? null) === (right.reason ?? null);
}

function isSameClientMergeEdge(left: ClientMergeEvent, right: ClientMergeEvent): boolean {
  return clientMergeEventTenantId(left) === clientMergeEventTenantId(right)
    && left.action === right.action
    && left.mergeGraphEdge === right.mergeGraphEdge;
}

function isSameClientMergeEventPayload(left: ClientMergeEvent, right: ClientMergeEvent, options: { ignoreId?: boolean } = {}): boolean {
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

function clientMergeEventTenantId(event: ClientMergeEvent): string {
  return event.tenantId ?? "tenant-volga";
}

function parseClientMergeConflictState(state: string): ClientMergeConflictState {
  if (state === "dismissed" || state === "open" || state === "resolved") {
    return state;
  }

  throw new Error(`Unsupported client merge conflict state: ${state}`);
}

function toPrismaWorkspaceFileCreateInput(file: FileRecord): PrismaWorkspaceFileCreateInput {
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
    tenantId: file.tenantId ?? "tenant-volga"
  };
}

function toPrismaWorkspaceFileUpdateInput(file: PrismaWorkspaceFileCreateInput): PrismaWorkspaceFileUpdateInput {
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

function toPrismaWorkspaceFileScanUpdateInput(scanResult: FileScanResultRecord): PrismaWorkspaceFileScanUpdateInput {
  return {
    scanCheckedAt: scanResult.scanCheckedAt ? new Date(scanResult.scanCheckedAt) : null,
    scanReason: scanResult.scanReason ?? null,
    scanState: scanResult.scanState,
    scanVerdict: scanResult.scanVerdict ?? null,
    scanner: scanResult.scanner ?? null
  };
}

function toFileScanResultIdempotencyRecord(row: PrismaFileScanResultIdempotencyRow): FileScanResultIdempotencyRecord {
  return {
    fileId: row.fileId,
    fingerprint: row.fingerprint,
    key: row.key,
    result: clone(row.result)
  };
}

function toFileRecord(row: PrismaWorkspaceFileRow): FileRecord {
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

function toPrismaClientProfileCreateInput(profile: ClientProfileRecord): PrismaClientProfileCreateInput {
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
    tenantId: profile.tenantId ?? "tenant-volga",
    topic: profile.topic
  };
}

function toPrismaClientProfileUpdateInput(profile: PrismaClientProfileCreateInput): PrismaClientProfileUpdateInput {
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

function toClientProfileRecord(row: PrismaClientProfileRow): ClientProfileRecord {
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

function toPrismaClientMergeEventCreateInput(event: ClientMergeEvent): PrismaClientMergeEventCreateInput {
  return {
    action: event.action,
    candidateProfileId: event.candidateProfileId ?? null,
    detachedProfileId: event.detachedProfileId ?? null,
    id: event.id,
    immutable: event.immutable,
    mergeGraphEdge: event.mergeGraphEdge,
    primaryProfileId: event.primaryProfileId,
    reason: event.reason ?? null,
    tenantId: event.tenantId ?? "tenant-volga"
  };
}

function toPrismaClientMergeEventUpdateInput(event: PrismaClientMergeEventCreateInput): PrismaClientMergeEventUpdateInput {
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

function toClientMergeEvent(row: PrismaClientMergeEventRow): ClientMergeEvent {
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

function toPrismaClientMergeConflictCreateInput(conflict: ClientMergeConflictRecord): PrismaClientMergeConflictCreateInput {
  return {
    candidateProfileId: conflict.candidateProfileId,
    conflictingFields: clone(conflict.conflictingFields),
    id: conflict.id,
    primaryProfileId: conflict.primaryProfileId,
    reason: conflict.reason,
    state: parseClientMergeConflictState(conflict.state),
    tenantId: conflict.tenantId ?? "tenant-volga"
  };
}

function toPrismaClientMergeConflictUpsertUpdateInput(conflict: PrismaClientMergeConflictCreateInput): PrismaClientMergeConflictUpsertUpdateInput {
  return {
    candidateProfileId: conflict.candidateProfileId,
    conflictingFields: clone(conflict.conflictingFields),
    primaryProfileId: conflict.primaryProfileId,
    reason: conflict.reason,
    state: conflict.state,
    tenantId: conflict.tenantId
  };
}

function toClientMergeConflictRecord(row: PrismaClientMergeConflictRow): ClientMergeConflictRecord {
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

function toPrismaKnowledgeArticleCreateInput(article: KnowledgeArticle): PrismaKnowledgeArticleCreateInput {
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
    tenantId: article.tenantId ?? "tenant-volga",
    title: article.title,
    topics: clone(article.topics),
    updatedAt: new Date(article.updated),
    usage: article.usage,
    version: article.version,
    versions: clone(article.versions),
    visibility: article.visibility
  };
}

function toPrismaKnowledgeArticleUpdateInput(article: PrismaKnowledgeArticleCreateInput): PrismaKnowledgeArticleUpdateInput {
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

function toKnowledgeArticle(row: PrismaKnowledgeArticleRow): KnowledgeArticle {
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

function toPrismaKnowledgeDraftVersionCreateInput(version: KnowledgeDraftVersionRecord): PrismaKnowledgeDraftVersionCreateInput {
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

function toPrismaKnowledgeDraftVersionUpdateInput(version: PrismaKnowledgeDraftVersionCreateInput): PrismaKnowledgeDraftVersionUpdateInput {
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

function toKnowledgeDraftVersionRecord(row: PrismaKnowledgeDraftVersionRow): KnowledgeDraftVersionRecord {
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

function toPrismaKnowledgeApprovalDecisionCreateInput(decision: KnowledgeApprovalDecisionRecord): PrismaKnowledgeApprovalDecisionCreateInput {
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

function toPrismaKnowledgeApprovalDecisionUpdateInput(decision: PrismaKnowledgeApprovalDecisionCreateInput): PrismaKnowledgeApprovalDecisionUpdateInput {
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

function toKnowledgeApprovalDecisionRecord(row: PrismaKnowledgeApprovalDecisionRow): KnowledgeApprovalDecisionRecord {
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

function toPrismaTemplateRecordCreateInput(template: TemplateRecord): PrismaTemplateRecordCreateInput {
  return {
    auditId: template.auditId ?? null,
    channel: template.channel,
    id: template.id,
    scope: template.scope,
    tenantId: template.tenantId ?? "tenant-volga",
    text: template.text,
    title: template.title,
    topic: template.topic,
    updatedAt: new Date(template.updated),
    usage: template.usage,
    version: template.version
  };
}

function toPrismaTemplateRecordUpdateInput(template: PrismaTemplateRecordCreateInput): PrismaTemplateRecordUpdateInput {
  return {
    auditId: template.auditId,
    channel: template.channel,
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

function toTemplateRecord(row: PrismaTemplateRecordRow): TemplateRecord {
  return {
    ...(row.auditId !== null ? { auditId: row.auditId } : {}),
    channel: row.channel,
    id: row.id,
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

function toPrismaTemplateVersionCreateInput(version: TemplateVersionRecord): PrismaTemplateVersionCreateInput {
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

function toPrismaTemplateVersionUpdateInput(version: PrismaTemplateVersionCreateInput): PrismaTemplateVersionUpdateInput {
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

function toTemplateVersionRecord(row: PrismaTemplateVersionRow): TemplateVersionRecord {
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

function toPrismaTemplateAuditEventCreateInput(event: TemplateAuditRecord): PrismaTemplateAuditEventCreateInput {
  return {
    action: event.action,
    id: event.id,
    immutable: event.immutable,
    reason: event.reason ?? null,
    templateId: event.templateId,
    timestamp: new Date(event.timestamp)
  };
}

function toPrismaTemplateAuditEventUpdateInput(event: PrismaTemplateAuditEventCreateInput): PrismaTemplateAuditEventUpdateInput {
  return {
    action: event.action,
    immutable: event.immutable,
    reason: event.reason,
    templateId: event.templateId,
    timestamp: event.timestamp
  };
}

function toTemplateAuditRecord(row: PrismaTemplateAuditEventRow): TemplateAuditRecord {
  return {
    action: row.action,
    id: row.id,
    immutable: true,
    ...(row.reason !== null ? { reason: row.reason } : {}),
    templateId: row.templateId,
    timestamp: row.timestamp.toISOString()
  };
}

function clientMergeEventWhere(filters: ClientMergeEventFilters): PrismaClientMergeEventFindManyInput["where"] {
  const where: NonNullable<PrismaClientMergeEventFindManyInput["where"]> = {};
  if (filters.tenantId) where.tenantId = filters.tenantId;
  if (filters.primaryProfileId) where.primaryProfileId = filters.primaryProfileId;
  if (filters.candidateProfileId) where.candidateProfileId = filters.candidateProfileId;
  if (filters.detachedProfileId) where.detachedProfileId = filters.detachedProfileId;
  return Object.keys(where).length ? where : undefined;
}

function clientMergeConflictWhere(filters: ClientMergeConflictFilters): PrismaClientMergeConflictFindManyInput["where"] {
  const where: NonNullable<PrismaClientMergeConflictFindManyInput["where"]> = {};
  if (filters.tenantId) where.tenantId = filters.tenantId;
  if (filters.primaryProfileId) where.primaryProfileId = filters.primaryProfileId;
  if (filters.state) where.state = filters.state;
  return Object.keys(where).length ? where : undefined;
}

function clone<T>(value: T): T {
  if (value === undefined) {
    return value;
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

function isPrismaNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "P2025";
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "P2002";
}
