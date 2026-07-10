import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { useDialogActions } from "../src/app/useDialogActions.js";
import {
  mapApiMessage,
  mapApiConversation,
  mapApiConversationCollection
} from "../src/app/conversationApiMapper.js";

describe("conversationApiMapper", () => {
  it("maps a dialog API item to UI conversation shape", () => {
    const apiItem = {
      id: "conv-42",
      name: "Test User",
      channel: "Telegram",
      phone: "+7 900 111-22-33",
      status: "waiting_operator",
      preview: "Need help with payment",
      topic: "Оплата / Возврат",
      sla: "Waiting",
      slaTone: "hold",
      time: "now",
      tags: ["важно"],
      previous: [["2026-06-30", "Issue", "Closed"]],
      messages: [
        { id: "m-1", side: "client", text: "Hello", time: "10:00" },
        { id: "m-2", type: "event", text: "Assigned", time: "now" }
      ]
    };

    const mapped = mapApiConversation(apiItem);

    assert.deepEqual(mapped, {
      id: "conv-42",
      name: "Test User",
      initials: "TU",
      avatar: "",
      channel: "Telegram",
      phone: "+7 900 111-22-33",
      time: "сейчас",
      preview: "Need help with payment",
      status: "waiting_operator",
      sla: "Waiting",
      slaTone: "hold",
      topic: "Оплата / Возврат",
      unread: false,
      device: "Unknown",
      entry: "Telegram",
      language: "Русский",
      clientSince: "Новый контакт",
      tags: ["важно"],
      previous: [["2026-06-30", "Issue", "Closed"]],
      messages: [
        { id: "m-1", side: "client", text: "Hello", time: "10:00" },
        { id: "m-2", type: "event", text: "Assigned", time: "сейчас" }
      ]
    });
  });

  it("maps envelope collection into UI items", () => {
    const mapped = mapApiConversationCollection({
      items: [
        {
          id: "conv-a",
          name: "Alice",
          channel: "SDK",
          status: "active",
          messages: []
        }
      ]
    });

    assert.equal(mapped.length, 1);
    assert.equal(mapped[0].id, "conv-a");
    assert.equal(mapped[0].channel, "SDK");
    assert.equal(mapped[0].entry, "SDK");
    assert.equal(mapped[0].status, "active");
  });

  it("preserves message timestamps for dynamic dialog time labels", () => {
    const mapped = mapApiMessage({
      id: "m-time",
      side: "client",
      text: "Timestamped message",
      time: "now",
      createdAt: "2026-07-02T12:00:00.000"
    });

    assert.equal(mapped.createdAt, "2026-07-02T12:00:00.000");
  });
});

describe("useConversationInbox", () => {
  it("refreshes dialogs after the tenant session becomes active", () => {
    const source = readFileSync(new URL("../src/app/useConversationInbox.js", import.meta.url), "utf8");
    const dependencyList = source.match(/const refreshInbox = useCallback\([\s\S]*?\}, \[([^\]]*)\]\);/)?.[1] ?? "";

    assert.match(dependencyList, /\bsessionActive\b/);
  });

  it("replays realtime events fetched with the authorized API fallback", async () => {
    const { replayRealtimeEvents } = await import("../src/app/useRealtimeInbox.js");
    const seen = [];
    const nextEventId = await replayRealtimeEvents({
      fetchEvents: async ({ since }) => {
        assert.equal(since, "rt-1");
        return {
          status: "ok",
          data: {
            events: [
              { eventId: "rt-2", eventName: "message.created", resourceId: "telegram-chat" },
              { eventId: "rt-3", eventName: "conversation.updated", resourceId: "telegram-chat" }
            ]
          }
        };
      },
      lastEventId: "rt-1",
      onEvent: (event) => seen.push(event)
    });

    assert.deepEqual(seen.map((event) => event.eventId), ["rt-2", "rt-3"]);
    assert.equal(nextEventId, "rt-3");
  });

  it("does not open query-token SSE unless that runtime mode is enabled", async () => {
    const { shouldOpenRealtimeEventSource } = await import("../src/app/useRealtimeInbox.js");

    assert.equal(shouldOpenRealtimeEventSource({ eventSourceAvailable: true, queryTokenEnabled: false, token: "token" }), false);
    assert.equal(shouldOpenRealtimeEventSource({ eventSourceAvailable: true, queryTokenEnabled: true, token: "token" }), true);
    assert.equal(shouldOpenRealtimeEventSource({ eventSourceAvailable: false, queryTokenEnabled: true, token: "token" }), false);
    assert.equal(shouldOpenRealtimeEventSource({ eventSourceAvailable: true, queryTokenEnabled: true, token: "" }), false);
  });
});

describe("dialog operator workflow", () => {
  it("keeps topic selection internal and does not append a client-visible message", () => {
    const appendedMessages = [];
    const toasts = [];
    let topics = { "conv-42": "" };
    const actions = useDialogActions({
      access: { canManageDialogs: true, reason: "" },
      appendMessage: (...args) => appendedMessages.push(args),
      applyConversationStatus: () => {},
      attachments: [],
      clearAttachments: () => {},
      closedIds: new Set(),
      composeMode: "reply",
      draft: "",
      isClosed: false,
      selected: { id: "conv-42", rescue: null, status: "active" },
      selectedStatus: "active",
      selectedTopic: "",
      setClosedIds: () => {},
      setConversationItems: () => {},
      setDraft: () => {},
      setFilter: () => {},
      setToast: (message) => toasts.push(message),
      setTopics: (updater) => {
        topics = typeof updater === "function" ? updater(topics) : updater;
      },
      topics
    });

    actions.handleTopicChange("Delivery / Status");

    assert.equal(appendedMessages.length, 0);
    assert.equal(topics["conv-42"], "Delivery / Status");
    assert.match(toasts.at(-1), /audit/i);
  });
});

describe("outbound conversation workflow", () => {
  it("creates a visible queued conversation from the backend outbound descriptor", async () => {
    const { submitOutboundConversation } = await import("../src/app/useOutboundConversation.js");
    const requests = [];
    const result = await submitOutboundConversation({
      channel: "SDK",
      clientName: "Queued Client",
      device: "Android / iOS",
      message: "Backend queued hello",
      phone: "+7 999 777-66-55",
      topic: "Delivery / Status"
    }, {
      createOutboundConversationRequest: async (payload) => {
        requests.push(payload);
        return {
          status: "ok",
          data: {
            auditId: "evt_outbound_1",
            backendQueueId: "outbound_1",
            channel: "SDK",
            clientName: "Queued Client",
            consentCheck: "required_before_send",
            descriptorId: "outbound_1",
            message: "Backend queued hello",
            outboxEventId: "outbox_1",
            phone: "+7 999 777-66-55",
            queue: "message-delivery",
            status: "queued",
            topic: "Delivery / Status"
          }
        };
      }
    });

    assert.deepEqual(requests, [{
      channel: "SDK",
      clientName: "Queued Client",
      message: "Backend queued hello",
      phone: "+7 999 777-66-55",
      topic: "Delivery / Status"
    }]);
    assert.equal(result.ok, true);
    assert.equal(result.conversation.id, "outbound_1");
    assert.equal(result.conversation.status, "queued");
    assert.equal(result.conversation.name, "Queued Client");
    assert.equal(result.conversation.outboundDescriptor.outboxEventId, "outbox_1");
  });

  it("returns an error result without a local conversation when the backend rejects outbound", async () => {
    const { submitOutboundConversation } = await import("../src/app/useOutboundConversation.js");
    const result = await submitOutboundConversation({
      channel: "SDK",
      clientName: "Queued Client",
      message: "Backend queued hello",
      phone: "+7 999 777-66-55",
      topic: ""
    }, {
      createOutboundConversationRequest: async () => ({
        status: "invalid",
        data: null,
        error: {
          code: "topic_required",
          message: "topic is required for outbound conversation delivery."
        }
      })
    });

    assert.equal(result.ok, false);
    assert.equal(result.conversation, undefined);
    assert.match(result.message, /topic is required/);
  });
});

describe("composer attachment workflow", () => {
  it("keeps backend scan-pending attachment blocked after upload descriptor creation", async () => {
    const { uploadComposerAttachment } = await import("../src/app/useComposerAttachments.js");
    const requests = [];
    const result = await uploadComposerAttachment(
      {
        id: "local-receipt",
        channel: "SDK",
        idempotencyKey: "attachment-upload-local-receipt",
        name: "receipt.pdf",
        progress: 64,
        sizeBytes: 2048,
        status: "uploading",
        type: "PDF"
      },
      {
        uploadAttachment: async (payload) => {
          requests.push(payload);
          return {
            status: "ok",
            data: {
              antivirusState: "scan_pending",
              descriptorId: "attachment_descriptor_1",
              fileId: "file_1",
              fileName: "receipt.pdf",
              outboxEventId: "outbox_file_scan_1",
              queue: "file-scan",
              storageState: "upload_queued",
              uploadPolicy: {
                deliveryState: "not_sent",
                queue: "file-scan",
                retryable: true,
                scanState: "scan_pending",
                storageState: "upload_queued"
              }
            }
          };
        }
      }
    );

    assert.deepEqual(requests, [{
      channel: "SDK",
      fileName: "receipt.pdf",
      idempotencyKey: "attachment-upload-local-receipt",
      sizeBytes: 2048
    }]);
    assert.equal(result.status, "uploading");
    assert.equal(result.fileId, "file_1");
    assert.equal(result.descriptorId, "attachment_descriptor_1");
    assert.equal(result.backendState.antivirusState, "scan_pending");
    assert.equal(result.uploadPolicy.queue, "file-scan");
    assert.equal(result.uploadPolicy.scanState, "scan_pending");
    assert.match(result.error, /scan/i);
  });

  it("uploads attachment bytes, finalizes the backend file and polls until scan-ready", async () => {
    const { uploadComposerAttachment } = await import("../src/app/useComposerAttachments.js");
    const requests = [];
    const fileUploads = [];
    const finalizes = [];
    const statusChecks = [];
    const localFile = { size: 2048, type: "application/pdf" };
    const result = await uploadComposerAttachment(
      {
        channel: "SDK",
        file: localFile,
        id: "local-signed-upload",
        idempotencyKey: "attachment-upload-local-signed",
        mimeType: "application/pdf",
        name: "signed-upload.pdf",
        progress: 64,
        sizeBytes: 2048,
        status: "uploading",
        type: "PDF"
      },
      {
        uploadAttachment: async (payload) => {
          requests.push(payload);
          return {
            status: "ok",
            data: {
              antivirusState: "scan_pending",
              descriptorId: "attachment_descriptor_signed",
              fileId: "file_signed",
              fileName: "signed-upload.pdf",
              outboxEventId: "outbox_file_scan_signed",
              queue: "file-scan",
              signedUpload: {
                expiresAt: "2026-07-09T08:15:00.000Z",
                headers: { "content-type": "application/pdf" },
                method: "PUT",
                url: "https://storage.example.test/upload/file_signed"
              },
              storageState: "upload_queued",
              uploadPolicy: {
                deliveryState: "not_sent",
                queue: "file-scan",
                retryable: true,
                scanState: "scan_pending",
                storageState: "upload_queued"
              }
            }
          };
        },
        uploadAttachmentFile: async (file, signedUpload) => {
          fileUploads.push({ file, signedUpload });
        },
        finalizeAttachmentUpload: async (payload) => {
          finalizes.push(payload);
          return {
            status: "ok",
            data: {
              antivirusState: "scan_pending",
              descriptorId: "attachment_descriptor_signed",
              fileId: "file_signed",
              fileName: "signed-upload.pdf",
              storageState: "uploaded",
              uploadPolicy: {
                deliveryState: "not_sent",
                queue: "file-scan",
                retryable: true,
                scanState: "scan_pending",
                storageState: "uploaded"
              }
            }
          };
        },
        fetchAttachmentStatus: async (fileId) => {
          statusChecks.push(fileId);
          return {
            status: "ok",
            data: {
              antivirusState: statusChecks.length === 1 ? "scan_pending" : "scan_clean",
              descriptorId: "attachment_descriptor_signed",
              fileId,
              fileName: "signed-upload.pdf",
              storageState: "uploaded",
              uploadPolicy: {
                deliveryState: statusChecks.length === 1 ? "not_sent" : "ready",
                queue: "file-scan",
                retryable: statusChecks.length === 1,
                scanState: statusChecks.length === 1 ? "scan_pending" : "scan_clean",
                storageState: "uploaded"
              }
            }
          };
        },
        statusPollAttempts: 2,
        statusPollDelayMs: 0
      }
    );

    assert.deepEqual(requests, [{
      channel: "SDK",
      fileName: "signed-upload.pdf",
      idempotencyKey: "attachment-upload-local-signed",
      mimeType: "application/pdf",
      sizeBytes: 2048
    }]);
    assert.deepEqual(fileUploads, [{
      file: localFile,
      signedUpload: {
        expiresAt: "2026-07-09T08:15:00.000Z",
        headers: { "content-type": "application/pdf" },
        method: "PUT",
        url: "https://storage.example.test/upload/file_signed"
      }
    }]);
    assert.deepEqual(finalizes, [{ fileId: "file_signed" }]);
    assert.deepEqual(statusChecks, ["file_signed", "file_signed"]);
    assert.equal(result.status, "ready");
    assert.equal(result.backendState.antivirusState, "scan_clean");
  });

  it("marks an attachment ready only when the backend descriptor allows delivery", async () => {
    const { mergeAttachmentUploadDescriptor } = await import("../src/app/useComposerAttachments.js");
    const result = mergeAttachmentUploadDescriptor(
      {
        id: "local-clean",
        channel: "SDK",
        name: "clean.pdf",
        progress: 64,
        sizeBytes: 2048,
        status: "uploading",
        type: "PDF"
      },
      {
        antivirusState: "scan_clean",
        descriptorId: "attachment_descriptor_clean",
        fileId: "file_clean",
        fileName: "clean.pdf",
        storageState: "uploaded"
      }
    );

    assert.equal(result.status, "ready");
    assert.equal(result.progress, 100);
    assert.equal(result.fileId, "file_clean");
    assert.equal(result.error, "");
  });

  it("blocks infected attachment descriptors without retrying as a local success", async () => {
    const { mergeAttachmentUploadDescriptor } = await import("../src/app/useComposerAttachments.js");
    const result = mergeAttachmentUploadDescriptor(
      {
        id: "local-infected",
        channel: "SDK",
        name: "infected.pdf",
        progress: 64,
        sizeBytes: 2048,
        status: "uploading",
        type: "PDF"
      },
      {
        antivirusState: "infected",
        descriptorId: "attachment_descriptor_infected",
        fileId: "file_infected",
        fileName: "infected.pdf",
        storageState: "uploaded"
      }
    );

    assert.equal(result.status, "error");
    assert.equal(result.retryable, false);
    assert.match(result.error, /blocked/i);
  });

  it("keeps backend upload failures as retryable attachment errors", async () => {
    const { uploadComposerAttachment } = await import("../src/app/useComposerAttachments.js");
    const result = await uploadComposerAttachment(
      {
        id: "local-fail",
        channel: "SDK",
        idempotencyKey: "attachment-upload-local-fail",
        name: "receipt.pdf",
        progress: 64,
        sizeBytes: 2048,
        status: "uploading",
        type: "PDF"
      },
      {
        uploadAttachment: async () => ({
          status: "invalid",
          error: {
            code: "attachment_payload_required",
            message: "channel and fileName are required."
          }
        })
      }
    );

    assert.equal(result.status, "error");
    assert.equal(result.retryable, true);
    assert.match(result.error, /channel and fileName/);
  });

  it("does not append a message while backend scan state is still pending", async () => {
    const appendedMessages = [];
    const toasts = [];
    const actions = useDialogActions({
      access: { canManageDialogs: true, reason: "" },
      appendMessage: (...args) => {
        appendedMessages.push(args);
        return { ok: true };
      },
      applyConversationStatus: () => {},
      attachments: [{
        descriptorId: "attachment_descriptor_pending",
        fileId: "file_pending",
        name: "pending.pdf",
        status: "uploading"
      }],
      clearAttachments: () => {},
      closedIds: new Set(),
      composeMode: "reply",
      draft: "Please see attachment",
      isClosed: false,
      selected: { id: "conv-42", rescue: null, status: "active" },
      selectedStatus: "active",
      selectedTopic: "Delivery / Status",
      setClosedIds: () => {},
      setConversationItems: () => {},
      setDraft: () => {},
      setFilter: () => {},
      setToast: (message) => toasts.push(message),
      setTopics: () => {},
      topics: { "conv-42": "Delivery / Status" }
    });

    await actions.handleSend();

    assert.equal(appendedMessages.length, 0);
    assert.ok(toasts.length > 0);
  });

  it("appends ready backend-scanned attachments with descriptor evidence", async () => {
    const appendedMessages = [];
    let cleared = false;
    let draft = "Clean attachment";
    const actions = useDialogActions({
      access: { canManageDialogs: true, reason: "" },
      appendMessage: (...args) => {
        appendedMessages.push(args);
        return { ok: true };
      },
      applyConversationStatus: () => {},
      attachments: [{
        descriptorId: "attachment_descriptor_clean",
        fileId: "file_clean",
        name: "clean.pdf",
        status: "ready"
      }],
      clearAttachments: () => {
        cleared = true;
      },
      closedIds: new Set(),
      composeMode: "reply",
      draft,
      isClosed: false,
      selected: { id: "conv-42", rescue: null, status: "active" },
      selectedStatus: "active",
      selectedTopic: "Delivery / Status",
      setClosedIds: () => {},
      setConversationItems: () => {},
      setDraft: (nextDraft) => {
        draft = nextDraft;
      },
      setFilter: () => {},
      setToast: () => {},
      setTopics: () => {},
      topics: { "conv-42": "Delivery / Status" }
    });

    await actions.handleSend();

    assert.equal(appendedMessages.length, 1);
    assert.equal(appendedMessages[0][0], "conv-42");
    assert.equal(appendedMessages[0][1].attachments[0].fileId, "file_clean");
    assert.equal(appendedMessages[0][1].attachments[0].descriptorId, "attachment_descriptor_clean");
    assert.equal(cleared, true);
    assert.equal(draft, "");
  });
});

describe("dialog transcript behavior", () => {
  it("keeps audit and internal records out of the client transcript", async () => {
    const { getVisibleMessages } = await import("../src/features/dialogs/timelineModel.js");
    const messages = [
      { id: "client-1", side: "client", text: "Hello" },
      { id: "topic-event", type: "event", text: "Topic changed" },
      { id: "internal-note", type: "internal", text: "Operator note" },
      { id: "agent-1", side: "agent", text: "Answer" }
    ];

    assert.deepEqual(getVisibleMessages(messages, "all").map((message) => message.id), ["client-1", "agent-1"]);
    assert.deepEqual(getVisibleMessages(messages, "events").map((message) => message.id), ["topic-event"]);
    assert.deepEqual(getVisibleMessages(messages, "internal").map((message) => message.id), ["internal-note"]);
  });

  it("detects and preserves the pinned-to-bottom transcript state", async () => {
    const { isTranscriptPinnedToBottom, scrollTranscriptToBottom, shouldUpdatePinnedStateFromScroll } = await import("../src/features/dialogs/timelineModel.js");
    const pinned = { clientHeight: 300, scrollHeight: 1000, scrollTop: 698 };
    const detached = { clientHeight: 300, scrollHeight: 1000, scrollTop: 650 };

    assert.equal(isTranscriptPinnedToBottom(pinned), true);
    assert.equal(isTranscriptPinnedToBottom(detached), false);
    assert.equal(shouldUpdatePinnedStateFromScroll(false), false);
    assert.equal(shouldUpdatePinnedStateFromScroll(true), true);

    scrollTranscriptToBottom(detached);
    assert.equal(detached.scrollTop, 1000);
  });

  it("formats message time from timestamp age and day", async () => {
    const { formatMessageTime } = await import("../src/features/dialogs/timelineModel.js");
    const now = new Date("2026-07-02T12:01:30.000");

    assert.equal(formatMessageTime({ createdAt: "2026-07-02T12:01:00.000", time: "now" }, { now }), "Сейчас");
    assert.equal(formatMessageTime({ createdAt: "2026-07-02T12:00:00.000", time: "now" }, { now }), "12:00");
    assert.equal(formatMessageTime({ createdAt: "2026-07-01T09:05:00.000", time: "now" }, { now }), "01.07.2026 09:05");
    assert.equal(formatMessageTime({ time: "10:42" }, { now }), "10:42");
  });
});
