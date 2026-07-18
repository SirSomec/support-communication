import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildDialogTranscriptDialogs,
  countDialogTranscriptEntries,
  DIALOG_TRANSCRIPT_COLUMN_IDS,
  DIALOG_TRANSCRIPT_REPORT_TYPE,
  dialogTranscriptXlsxInput,
  serializeDialogTranscriptsAsHtml,
  serializeDialogTranscriptsAsJson,
  serializeDialogTranscriptsAsTxt
} from "../apps/api-gateway/src/reports/report-dialog-transcripts.ts";
import {
  createDeterministicReportObjectStorageAdapter,
  serializeReportRowsAsXlsx
} from "../apps/api-gateway/src/reports/report-export.worker.ts";
import { createS3ReportObjectStorageAdapter } from "../apps/api-gateway/src/reports/report-object-storage.ts";
import {
  ReportRepository,
  type ConversationTranscriptSourceRow
} from "../apps/api-gateway/src/reports/report.repository.ts";
import { ReportService } from "../apps/api-gateway/src/reports/report.service.ts";

const SNAPSHOT_AT = "2026-07-18T10:00:00.000Z";

function transcriptFixtureRows(): ConversationTranscriptSourceRow[] {
  return [
    {
      channel: "Telegram",
      clientName: "Анна Смирнова",
      createdAt: "2026-07-18T07:00:00.000Z",
      id: "dlg-anna",
      messages: [
        { createdAt: "2026-07-18T07:00:00.000Z", id: "m1", side: "client", text: "Где мой заказ?", time: "10:00" },
        { createdAt: "2026-07-18T07:01:00.000Z", id: "m2", text: "Назначено на Марию", time: "10:01", type: "event" },
        { author: "Мария Орлова", createdAt: "2026-07-18T07:02:00.000Z", id: "m3", side: "agent", text: "Проверяю ваш заказ <b>A-1042</b>.", time: "10:02" },
        { author: "Мария Орлова", createdAt: "2026-07-18T07:03:00.000Z", id: "m4", text: "Уточнить у курьера до ответа.", time: "10:03", type: "internal" },
        { createdAt: "2026-07-18T07:10:00.000Z", id: "m5", text: "Спасибо, оперативно!", time: "10:10", type: "csat_feedback" }
      ],
      operatorId: "operator-maria",
      operatorName: "Мария Орлова",
      rating: { createdAt: "2026-07-18T07:09:00.000Z", scale: "CSAT", score: 5 },
      status: "closed",
      topic: "Доставка / Статус",
      updatedAt: "2026-07-18T07:10:00.000Z"
    },
    {
      channel: "VK",
      clientName: "Пётр Волков",
      createdAt: "2026-07-18T08:00:00.000Z",
      id: "dlg-petr",
      messages: [
        { createdAt: "2026-07-18T08:00:00.000Z", id: "p1", side: "client", text: "Не приходит код подтверждения", time: "11:00" },
        { createdAt: "2026-07-18T08:02:00.000Z", id: "p2", side: "agent", text: "Пришлите последние четыре цифры номера.", time: "11:02" }
      ],
      operatorId: "operator-ivan",
      operatorName: "Иван Петров",
      status: "active",
      topic: "Авторизация / Код",
      updatedAt: "2026-07-18T08:02:00.000Z"
    },
    {
      channel: "SDK",
      clientName: "Ольга Ленская",
      createdAt: "2026-07-18T09:00:00.000Z",
      id: "dlg-olga",
      messages: [
        { createdAt: "2026-07-18T09:00:00.000Z", id: "o1", side: "client", text: "Хочу вернуть товар", time: "12:00" }
      ],
      rating: { createdAt: "2026-07-18T09:30:00.000Z", scale: "CSAT", score: 2 },
      status: "waiting_operator",
      topic: "Возвраты",
      updatedAt: "2026-07-18T09:30:00.000Z"
    }
  ];
}

function createTranscriptReportService(options: {
  rows?: ConversationTranscriptSourceRow[];
  storage?: ReturnType<typeof createDeterministicReportObjectStorageAdapter>;
} = {}): {
  calls: Array<{ from: Date; tenantId: string; to: Date }>;
  repository: ReportRepository;
  service: ReportService;
  storage: ReturnType<typeof createDeterministicReportObjectStorageAdapter>;
} {
  const repository = ReportRepository.inMemory();
  const calls: Array<{ from: Date; tenantId: string; to: Date }> = [];
  const rows = options.rows ?? transcriptFixtureRows();
  repository.listConversationTranscriptSourceRowsAsync = async (input) => {
    calls.push(input);
    return rows.filter(() => input.tenantId === "tenant-volga");
  };
  const storage = options.storage ?? createDeterministicReportObjectStorageAdapter({
    now: () => new Date(SNAPSHOT_AT)
  });
  const service = new ReportService(repository, {
    now: () => new Date(SNAPSHOT_AT),
    objectStorage: storage
  });

  return { calls, repository, service, storage };
}

describe("dialog transcript export contracts", () => {
  it("builds dialogs with messages, comments and csat feedback attributed to authors", () => {
    const dialogs = buildDialogTranscriptDialogs(transcriptFixtureRows());

    assert.equal(dialogs.length, 3);
    const anna = dialogs[0];
    assert.equal(anna.clientName, "Анна Смирнова");
    assert.equal(anna.statusLabel, "Закрыто");
    assert.equal(anna.rating?.score, 5);
    assert.deepEqual(anna.entries.map((entry) => entry.kind), ["message", "message", "comment", "csat_feedback"]);
    assert.deepEqual(anna.entries.map((entry) => entry.author), [
      "Анна Смирнова",
      "Мария Орлова",
      "Мария Орлова",
      "Анна Смирнова"
    ]);
    assert.deepEqual(anna.entries.map((entry) => entry.authorRole), ["client", "operator", "operator", "client"]);
    assert.ok(anna.entries.every((entry) => entry.kind !== "message" || entry.kindLabel.includes("Сообщение")));
    assert.equal(countDialogTranscriptEntries(dialogs), 7);

    const petr = dialogs[1];
    assert.equal(petr.rating, null);
    assert.equal(petr.entries[1].author, "Иван Петров");
  });

  it("filters dialogs by operator, topic, status and rating score", () => {
    const rows = transcriptFixtureRows();

    assert.deepEqual(buildDialogTranscriptDialogs(rows, { operatorId: "operator-maria" }).map((dialog) => dialog.id), ["dlg-anna"]);
    assert.deepEqual(buildDialogTranscriptDialogs(rows, { operatorId: "Иван Петров" }).map((dialog) => dialog.id), ["dlg-petr"]);
    assert.deepEqual(buildDialogTranscriptDialogs(rows, { topic: "возвраты" }).map((dialog) => dialog.id), ["dlg-olga"]);
    assert.deepEqual(buildDialogTranscriptDialogs(rows, { status: "active" }).map((dialog) => dialog.id), ["dlg-petr"]);
    assert.deepEqual(buildDialogTranscriptDialogs(rows, { score: "5" }).map((dialog) => dialog.id), ["dlg-anna"]);
    assert.deepEqual(buildDialogTranscriptDialogs(rows, { score: "2" }).map((dialog) => dialog.id), ["dlg-olga"]);
    assert.deepEqual(buildDialogTranscriptDialogs(rows, { score: "none" }).map((dialog) => dialog.id), ["dlg-petr"]);
    assert.deepEqual(
      buildDialogTranscriptDialogs(rows, { operatorId: "all", score: "all", status: "Все статусы", topic: "all" }).map((dialog) => dialog.id),
      ["dlg-anna", "dlg-petr", "dlg-olga"]
    );
    assert.deepEqual(buildDialogTranscriptDialogs(rows, { operatorId: "operator-maria", score: "none" }), []);
  });

  it("serializes transcripts to TXT with dialog headers and attributed lines", () => {
    const text = serializeDialogTranscriptsAsTxt(buildDialogTranscriptDialogs(transcriptFixtureRows()), {
      filters: { score: "all" },
      generatedAt: new Date(SNAPSHOT_AT)
    });

    assert.ok(text.includes("Выгрузка диалогов с перепиской"));
    assert.ok(text.includes("Диалог dlg-anna · Анна Смирнова · Telegram · Тематика: Доставка / Статус"));
    assert.ok(text.includes("Статус: Закрыто · Оператор: Мария Орлова · Оценка: 5 (CSAT)"));
    assert.ok(text.includes("Сообщение клиента — Анна Смирнова: Где мой заказ?"));
    assert.ok(text.includes("Внутренний комментарий — Мария Орлова: Уточнить у курьера до ответа."));
    assert.ok(text.includes("Отзыв клиента на оценку — Анна Смирнова: Спасибо, оперативно!"));
    assert.ok(text.includes("Оценка: без оценки"));
    assert.ok(!text.includes("Назначено на Марию"), "audit events must stay out of the transcript");
  });

  it("serializes transcripts to escaped standalone HTML", () => {
    const html = serializeDialogTranscriptsAsHtml(buildDialogTranscriptDialogs(transcriptFixtureRows()), {
      generatedAt: new Date(SNAPSHOT_AT)
    });

    assert.ok(html.startsWith("<!doctype html>"));
    assert.ok(html.includes("<meta charset=\"utf-8\">"));
    assert.ok(html.includes("Проверяю ваш заказ &lt;b&gt;A-1042&lt;/b&gt;."), "message text must be HTML-escaped");
    assert.ok(html.includes("class=\"entry comment\""));
    assert.ok(html.includes("Внутренний комментарий · Мария Орлова"));
    assert.ok(html.includes("Оценка: 5 (CSAT)"));
  });

  it("serializes transcripts to JSON with split messages, comments and feedback", () => {
    const payload = JSON.parse(serializeDialogTranscriptsAsJson(buildDialogTranscriptDialogs(transcriptFixtureRows()), {
      filters: { operatorId: "operator-maria", score: "5" },
      generatedAt: new Date(SNAPSHOT_AT)
    })) as Record<string, any>;

    assert.equal(payload.reportType, DIALOG_TRANSCRIPT_REPORT_TYPE);
    assert.equal(payload.dialogCount, 3);
    assert.equal(payload.entryCount, 7);
    assert.deepEqual(payload.filters, { operator: "operator-maria", score: "5", status: "all", topic: "all" });
    const anna = payload.dialogs[0];
    assert.equal(anna.client, "Анна Смирнова");
    assert.deepEqual(anna.status, { key: "closed", label: "Закрыто" });
    assert.deepEqual(anna.operator, { id: "operator-maria", name: "Мария Орлова" });
    assert.equal(anna.rating.score, 5);
    assert.equal(anna.messages.length, 2);
    assert.equal(anna.messages[0].author, "Анна Смирнова");
    assert.equal(anna.comments.length, 1);
    assert.equal(anna.comments[0].author, "Мария Орлова");
    assert.equal(anna.csatFeedback.length, 1);
    assert.equal(payload.dialogs[1].rating, null);
  });

  it("flattens transcripts to XLSX rows with one line per message or comment", () => {
    const input = dialogTranscriptXlsxInput(buildDialogTranscriptDialogs(transcriptFixtureRows()));

    assert.deepEqual(input.columns.map((column) => column.id), DIALOG_TRANSCRIPT_COLUMN_IDS);
    assert.equal(input.rows.length, 7);
    assert.equal(input.rows[0].client, "Анна Смирнова");
    assert.equal(input.rows[0].entryKind, "Сообщение клиента");
    assert.equal(input.rows[2].entryKind, "Внутренний комментарий");
    assert.equal(input.rows[2].author, "Мария Орлова");
    assert.equal(input.rows[0].rating, 5);
    const workbook = serializeReportRowsAsXlsx(input);
    assert.ok(Buffer.isBuffer(workbook));
    assert.equal(workbook.subarray(0, 2).toString("latin1"), "PK");
  });

  it("materializes dialog transcript exports synchronously and serves the download", async () => {
    const { calls, service, storage } = createTranscriptReportService();

    const requested = await service.requestReportExport({
      channel: "Все каналы",
      filters: {
        operatorId: "all",
        score: "all",
        snapshotAt: SNAPSHOT_AT,
        status: "all",
        topic: "all"
      },
      format: "TXT",
      period: "Сегодня",
      reportType: DIALOG_TRANSCRIPT_REPORT_TYPE
    }, { tenantId: "tenant-volga" });

    assert.equal(requested.status, "ok");
    const job = requested.data.job as Record<string, any>;
    assert.equal(job.format, "TXT");
    assert.equal(job.statusKey, "ready");
    assert.equal(job.progress, 100);
    assert.equal(job.rows, 7);
    assert.equal(job.fileName, `${job.id}.txt`);
    assert.equal(job.filters.reportKind, DIALOG_TRANSCRIPT_REPORT_TYPE);
    assert.ok(String(job.name).startsWith("Диалоги (переписка)"));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].tenantId, "tenant-volga");
    assert.ok(calls[0].from.getTime() <= calls[0].to.getTime());

    const download = await service.getExportFileDownload(job.id, { canDownload: true, tenantId: "tenant-volga" });
    assert.equal(download.status, "ok");
    assert.equal(download.data.contentType, "text/plain; charset=utf-8");
    const body = (download.data.body as Buffer).toString("utf8");
    assert.ok(body.includes("Внутренний комментарий — Мария Орлова"));
    assert.equal(storage.listObjects().length, 1);
    assert.equal(storage.listObjects()[0].objectKey, `reports/tenant-volga/${job.id}/${job.id}.txt`);
  });

  it("produces downloadable files for every supported format", async () => {
    for (const [format, contentType, marker] of [
      ["XLSX", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "PK"],
      ["HTML", "text/html; charset=utf-8", "<!doctype html>"],
      ["JSON", "application/json", "\"reportType\""],
      ["TXT", "text/plain; charset=utf-8", "Выгрузка диалогов"]
    ] as const) {
      const { service } = createTranscriptReportService();
      const requested = await service.requestReportExport({
        filters: { snapshotAt: SNAPSHOT_AT },
        format,
        period: "Сегодня",
        reportType: DIALOG_TRANSCRIPT_REPORT_TYPE
      }, { tenantId: "tenant-volga" });
      assert.equal(requested.status, "ok", `${format} request must succeed`);
      const job = requested.data.job as Record<string, any>;
      assert.equal(job.format, format);
      assert.equal(job.statusKey, "ready");

      const download = await service.getExportFileDownload(job.id, { canDownload: true, tenantId: "tenant-volga" });
      assert.equal(download.status, "ok", `${format} download must succeed`);
      assert.equal(download.data.contentType, contentType);
      const body = download.data.body as Buffer;
      assert.ok(body.length > 0);
      assert.ok(body.toString("utf8").startsWith(marker) || body.toString("utf8").includes(marker), `${format} body must contain ${marker}`);
    }
  });

  it("applies rating filters to the exported file", async () => {
    const { service } = createTranscriptReportService();

    const requested = await service.requestReportExport({
      filters: { score: "5", snapshotAt: SNAPSHOT_AT },
      format: "JSON",
      period: "Сегодня",
      reportType: DIALOG_TRANSCRIPT_REPORT_TYPE
    }, { tenantId: "tenant-volga" });
    assert.equal(requested.status, "ok");
    const job = requested.data.job as Record<string, any>;
    assert.equal(job.rows, 4);

    const download = await service.getExportFileDownload(job.id, { canDownload: true, tenantId: "tenant-volga" });
    const payload = JSON.parse((download.data.body as Buffer).toString("utf8")) as Record<string, any>;
    assert.equal(payload.dialogCount, 1);
    assert.deepEqual(payload.dialogs.map((dialog: Record<string, unknown>) => dialog.id), ["dlg-anna"]);
  });

  it("rejects unsupported dialog transcript formats", async () => {
    const { service } = createTranscriptReportService();

    const requested = await service.requestReportExport({
      format: "DOCX",
      period: "Сегодня",
      reportType: DIALOG_TRANSCRIPT_REPORT_TYPE
    }, { tenantId: "tenant-volga" });

    assert.equal(requested.status, "invalid");
    assert.equal(requested.error?.code, "report_export_format_unsupported");
  });

  it("maps Prisma conversations, message authors and latest CSAT ratings into transcript source rows", async () => {
    const conversationFindManyCalls: Array<Record<string, any>> = [];
    const ratingFindManyCalls: Array<Record<string, any>> = [];
    const unusedDelegate = () => ({
      create: async () => ({}),
      deleteMany: async () => ({ count: 0 }),
      findMany: async () => [],
      findUnique: async () => null,
      updateMany: async () => ({ count: 0 }),
      upsert: async () => ({})
    });
    const client = {
      $transaction: async (operations: unknown[]) => operations,
      conversation: {
        async findMany(input: Record<string, any>) {
          conversationFindManyCalls.push(input);
          return [{
            channel: "Telegram",
            createdAt: new Date("2026-07-18T07:00:00.000Z"),
            id: "dlg-anna",
            messages: [
              { author: null, createdAt: new Date("2026-07-18T07:00:00.000Z"), id: "m1", side: "client", text: "Где мой заказ?", time: "10:00", type: null },
              { author: "Мария Орлова", createdAt: new Date("2026-07-18T07:03:00.000Z"), id: "m4", side: null, text: "Уточнить у курьера.", time: "10:03", type: "internal" }
            ],
            name: "Анна Смирнова",
            operatorId: "operator-maria",
            operatorName: "Мария Орлова",
            queueId: null,
            resolutionOutcome: "resolved",
            slaTone: "closed",
            status: "closed",
            teamId: null,
            topic: "Доставка / Статус",
            updatedAt: new Date("2026-07-18T07:10:00.000Z")
          }];
        }
      },
      metricDefinition: unusedDelegate(),
      metricTenantOverride: unusedDelegate(),
      metricVersion: unusedDelegate(),
      qualityRating: {
        async findMany(input: Record<string, any>) {
          ratingFindManyCalls.push(input);
          return [
            { conversationId: "dlg-anna", createdAt: new Date("2026-07-18T07:05:00.000Z"), scale: "CSAT", score: 3 },
            { conversationId: "dlg-anna", createdAt: new Date("2026-07-18T07:09:00.000Z"), scale: "CSAT", score: 5 }
          ];
        }
      },
      reportExportJob: unusedDelegate(),
      reportExportRetryAuditEvent: unusedDelegate(),
      reportFileDescriptor: unusedDelegate(),
      reportIdempotencyKey: unusedDelegate(),
      reportNotificationDescriptor: unusedDelegate(),
      reportQueryExecution: unusedDelegate(),
      savedReportTemplate: unusedDelegate(),
      scheduledDigestDescriptor: unusedDelegate()
    };

    const repository = ReportRepository.prisma({ client: client as never });
    const rows = await repository.listConversationTranscriptSourceRowsAsync({
      from: new Date("2026-07-18T00:00:00.000Z"),
      tenantId: "tenant-volga",
      to: new Date("2026-07-19T00:00:00.000Z")
    });

    assert.equal(conversationFindManyCalls.length, 1);
    assert.equal(conversationFindManyCalls[0].where.tenantId, "tenant-volga");
    assert.deepEqual(ratingFindManyCalls[0].where, { conversationId: { in: ["dlg-anna"] }, tenantId: "tenant-volga" });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].clientName, "Анна Смирнова");
    assert.equal(rows[0].resolutionOutcome, "resolved");
    assert.equal(rows[0].rating?.score, 5, "the latest rating must win");
    assert.equal(rows[0].messages[0].author, undefined);
    assert.equal(rows[0].messages[1].author, "Мария Орлова");
    assert.equal(rows[0].messages[1].type, "internal");
  });

  it("signs server-side report uploads against the direct S3 endpoint even when a public upload base is set", async () => {
    const requests: Array<{ method?: string; url: string }> = [];
    const fakeFetch = (async (url: unknown, init?: { method?: string }) => {
      requests.push({ ...(init?.method ? { method: init.method } : {}), url: String(url) });
      return {
        arrayBuffer: async () => new ArrayBuffer(0),
        headers: new Headers(),
        ok: true,
        status: 200
      } as Response;
    }) as typeof fetch;
    const storage = createS3ReportObjectStorageAdapter({
      S3_ACCESS_KEY: "minio",
      S3_BUCKET: "support-communication-local",
      S3_ENDPOINT: "http://minio:9000",
      S3_PUBLIC_UPLOAD_BASE: "/s3",
      S3_SECRET_KEY: "minio-password"
    }, { fetch: fakeFetch, now: () => new Date(SNAPSHOT_AT) });

    await storage.putObject({
      body: "test",
      contentType: "text/plain; charset=utf-8",
      metadata: { format: "txt", jobId: "export-s3-check", metricDefinitionVersion: "metrics/v1" },
      objectKey: "reports/tenant-volga/export-s3-check/export-s3-check.txt"
    });

    assert.equal(requests.length, 1);
    assert.equal(requests[0].method, "PUT");
    assert.ok(
      requests[0].url.startsWith("http://minio:9000/"),
      `server-side upload must hit the direct S3 endpoint, got: ${requests[0].url}`
    );
  });

  it("marks failed materializations as retryable errors and recovers on retry", async () => {
    const failingStorage = createDeterministicReportObjectStorageAdapter({ now: () => new Date(SNAPSHOT_AT) });
    const originalPutObject = failingStorage.putObject.bind(failingStorage);
    let shouldFail = true;
    failingStorage.putObject = async (input) => {
      if (shouldFail) {
        throw new Error("object_storage_unavailable");
      }
      return originalPutObject(input);
    };
    const { repository, service } = createTranscriptReportService({ storage: failingStorage });

    const requested = await service.requestReportExport({
      filters: { snapshotAt: SNAPSHOT_AT },
      format: "HTML",
      period: "Сегодня",
      reportType: DIALOG_TRANSCRIPT_REPORT_TYPE
    }, { tenantId: "tenant-volga" });
    assert.equal(requested.status, "ok");
    const failedJob = requested.data.job as Record<string, any>;
    assert.equal(failedJob.statusKey, "error");
    assert.equal(failedJob.failureCode, "report_export_materialize_failed");

    shouldFail = false;
    const retried = await service.retryReportExport({ jobId: failedJob.id }, { tenantId: "tenant-volga" });
    assert.equal(retried.status, "ok");
    const retriedJob = retried.data.job as Record<string, any>;
    assert.equal(retriedJob.statusKey, "ready");
    assert.equal(retriedJob.rows, 7);

    const persisted = await repository.listExportJobsAsync({ tenantId: "tenant-volga" });
    assert.equal(persisted.find((item) => item.id === failedJob.id)?.statusKey, "ready");

    const download = await service.getExportFileDownload(failedJob.id, { canDownload: true, tenantId: "tenant-volga" });
    assert.equal(download.status, "ok");
    assert.ok((download.data.body as Buffer).toString("utf8").includes("Внутренний комментарий"));
  });
});
