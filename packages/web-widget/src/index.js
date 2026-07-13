const POLL_INTERVAL_MS = 3000;
const INVITATION_POLL_INTERVAL_MS = 5000;
const PRESENCE_INTERVAL_MS = 15000;
const DEFAULT_ENVIRONMENT = "stage";
const SUBJECT_STORAGE_KEY = "support-widget:subject-id";
const SESSION_STORAGE_KEY = "support-widget:session-id";

const state = {
  apiBase: "",
  publicKey: "",
  externalId: "",
  tenantId: "",
  integrationId: "",
  environment: DEFAULT_ENVIRONMENT,
  subjectId: null,
  sessionId: null,
  presencePath: "/public/sdk/presence/heartbeat",
  disconnectPath: "/public/sdk/presence/disconnect",
  presenceIntervalMs: PRESENCE_INTERVAL_MS,
  presenceTimer: null,
  presenceListenersAttached: false,
  conversationId: null,
  visitorSessionToken: null,
  lastOperatorMessageId: null,
  pollTimer: null,
  invitationPollTimer: null,
  currentInvitation: null,
  messages: [],
  panelOpen: false,
  initialized: false,
  ratingSubmitted: false
};

let rootEl = null;
let messagesEl = null;
let inputEl = null;
let sendBtn = null;
let toggleBtn = null;
let ratingEl = null;
let invitationEl = null;

export function init(options = {}) {
  const apiBase = String(options.apiBase ?? "").trim().replace(/\/+$/, "");
  const publicKey = String(options.publicKey ?? "").trim();
  const externalId = String(options.externalId ?? "").trim();

  if (!apiBase || !publicKey) {
    throw new Error("SupportWidget.init requires apiBase and publicKey.");
  }

  state.apiBase = apiBase;
  state.publicKey = publicKey;
  state.subjectId = externalId || getOrCreateIdentity(localStorage, SUBJECT_STORAGE_KEY, "visitor");
  state.sessionId = getOrCreateIdentity(sessionStorage, SESSION_STORAGE_KEY, "session");
  state.externalId = externalId || state.subjectId;
  state.tenantId = String(options.tenantId ?? "").trim();
  state.integrationId = String(options.integrationId ?? "").trim();
  state.environment = String(options.environment ?? DEFAULT_ENVIRONMENT).trim() || DEFAULT_ENVIRONMENT;
  state.presencePath = String(options.presencePath ?? "/public/sdk/presence/heartbeat").trim();
  state.disconnectPath = String(options.disconnectPath ?? "/public/sdk/presence/disconnect").trim();
  state.presenceIntervalMs = normalizeInterval(options.presenceIntervalMs);

  injectStyles();
  renderShell();
  startPresence();
  startInvitationPolling();

  // Presence intentionally starts before a conversation exists. The first
  // message or an accepted proactive invitation creates the conversation.
  state.initialized = true;
  startPolling();

  return { open, close, destroy };
}

function buildUrl(path, query = {}) {
  const url = new URL(`${state.apiBase}${path}`);
  url.searchParams.set("environment", state.environment);
  for (const [key, value] of Object.entries(query)) {
    if (value != null && String(value).length > 0) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function apiRequest(method, path, { body, query } = {}) {
  const response = await fetch(buildUrl(path, query), {
    method,
    headers: {
      authorization: `Bearer ${state.publicKey}`,
      ...(body ? { "content-type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const envelope = await response.json().catch(() => ({}));
  if (!response.ok || envelope.status === "denied" || envelope.status === "invalid" || envelope.status === "not_found") {
    const message = envelope.error?.message || `Request failed (${response.status})`;
    throw new Error(message);
  }

  return envelope.data ?? {};
}

async function sendVisitorMessage(text) {
  const data = await apiRequest("POST", "/public/sdk/messages", {
    body: {
      conversationId: state.conversationId,
      externalId: state.externalId,
      pageUrl: typeof window !== "undefined" ? window.location.href : undefined,
      text
    }
  });

  if (data.conversationId) {
    state.conversationId = data.conversationId;
  }
  if (data.visitorSessionToken) {
    state.visitorSessionToken = data.visitorSessionToken;
  }

  return data;
}

async function pollOperatorReplies() {
  if (!state.conversationId || !state.visitorSessionToken) {
    return;
  }

  const query = {
    visitorSessionToken: state.visitorSessionToken
  };
  if (state.lastOperatorMessageId) {
    query.since = state.lastOperatorMessageId;
  }

  const data = await apiRequest(
    "GET",
    `/public/sdk/conversations/${encodeURIComponent(state.conversationId)}/messages`,
    { query }
  );

  const replies = Array.isArray(data.messages) ? data.messages : [];
  for (const reply of replies) {
    appendMessage("operator", reply.text, reply.id, reply.attachments);
    if (reply.id) {
      state.lastOperatorMessageId = String(reply.id);
    }
  }
  if (data.conversationStatus === "closed" && !state.ratingSubmitted && ratingEl) {
    ratingEl.hidden = false;
  }
}

function presencePayload(status = "active") {
  const location = typeof window !== "undefined" ? window.location : null;
  return {
    subjectId: state.subjectId,
    sessionId: state.sessionId,
    externalId: state.externalId,
    tenantId: state.tenantId || undefined,
    integrationId: state.integrationId || undefined,
    pageUrl: location?.href,
    pagePath: location?.pathname,
    pageTitle: typeof document !== "undefined" ? document.title : undefined,
    visibility: typeof document !== "undefined" ? document.visibilityState : "visible",
    status
  };
}

async function pollInvitations() {
  if (!state.sessionId || state.currentInvitation) return;
  const data = await apiRequest("GET", "/public/sdk/invitations", {
    query: { sessionId: state.sessionId }
  });
  const invitation = firstInvitation(data.invitations);
  if (invitation) renderInvitation(invitation);
}

async function acknowledgeInvitation(exposureId, action) {
  return apiRequest("POST", invitationAcknowledgePath(exposureId, action), {
    body: { sessionId: state.sessionId }
  });
}

function startInvitationPolling() {
  stopInvitationPolling();
  pollInvitations().catch(() => {});
  state.invitationPollTimer = window.setInterval(() => {
    pollInvitations().catch(() => {});
  }, INVITATION_POLL_INTERVAL_MS);
}

function stopInvitationPolling() {
  if (state.invitationPollTimer != null) {
    window.clearInterval(state.invitationPollTimer);
    state.invitationPollTimer = null;
  }
}

function renderInvitation(invitation) {
  if (!rootEl || state.currentInvitation || !invitation?.exposureId) return;
  state.currentInvitation = invitation;
  invitationEl = document.createElement("section");
  invitationEl.className = "sw-invitation";
  invitationEl.setAttribute("aria-live", "polite");

  const message = document.createElement("p");
  message.textContent = String(invitation.message ?? "").trim() || "Нужна помощь?";
  const actions = document.createElement("div");
  const dismissButton = document.createElement("button");
  dismissButton.type = "button";
  dismissButton.textContent = "Не сейчас";
  const acceptButton = document.createElement("button");
  acceptButton.type = "button";
  acceptButton.className = "sw-invitation__accept";
  acceptButton.textContent = "Открыть чат";
  actions.append(dismissButton, acceptButton);
  invitationEl.append(message, actions);
  rootEl.appendChild(invitationEl);

  acknowledgeInvitation(invitation.exposureId, "shown").catch(() => {});
  dismissButton.addEventListener("click", () => handleInvitationAction("dismissed", dismissButton, acceptButton));
  acceptButton.addEventListener("click", () => handleInvitationAction("accepted", dismissButton, acceptButton));
}

async function handleInvitationAction(action, ...buttons) {
  const invitation = state.currentInvitation;
  if (!invitation) return;
  buttons.forEach((button) => { button.disabled = true; });
  try {
    const data = await acknowledgeInvitation(invitation.exposureId, action);
    if (action === "accepted") {
      const conversationId = String(data.conversationId ?? "").trim();
      if (!conversationId) throw new Error("Invitation acceptance did not include a conversation.");
      state.conversationId = conversationId;
      state.visitorSessionToken = null;
      state.lastOperatorMessageId = null;
      state.ratingSubmitted = false;
      if (ratingEl) ratingEl.hidden = true;
      open();
    }
    clearInvitation();
  } catch (error) {
    appendSystemMessage(`Не удалось обработать приглашение: ${error.message}`);
    buttons.forEach((button) => { button.disabled = false; });
  }
}

function clearInvitation() {
  state.currentInvitation = null;
  if (invitationEl?.parentNode) invitationEl.parentNode.removeChild(invitationEl);
  invitationEl = null;
}

async function sendPresenceHeartbeat() {
  if (!state.presencePath) return;
  await apiRequest("POST", state.presencePath, { body: presencePayload() });
}

function sendDisconnect() {
  if (!state.disconnectPath || !state.subjectId || !state.sessionId) return;
  const url = buildUrl(state.disconnectPath);
  const body = JSON.stringify(presencePayload("disconnected"));
  fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${state.publicKey}`,
      "content-type": "application/json"
    },
    body,
    keepalive: true
  }).catch(() => {});
}

function startPresence() {
  stopPresence();
  sendPresenceHeartbeat().catch(() => {});
  state.presenceTimer = window.setInterval(() => {
    sendPresenceHeartbeat().catch(() => {});
  }, state.presenceIntervalMs);
  if (!state.presenceListenersAttached) {
    document.addEventListener("visibilitychange", handlePageUpdate);
    window.addEventListener("pageshow", handlePageUpdate);
    window.addEventListener("pagehide", handlePageHide);
    state.presenceListenersAttached = true;
  }
}

function stopPresence() {
  if (state.presenceTimer != null) {
    window.clearInterval(state.presenceTimer);
    state.presenceTimer = null;
  }
}

function handlePageUpdate() {
  sendPresenceHeartbeat().catch(() => {});
}

function handlePageHide() {
  sendDisconnect();
}

async function sendQualityRating(score) {
  const data = await apiRequest("POST", `/public/sdk/conversations/${encodeURIComponent(state.conversationId)}/ratings`, {
    body: {
      idempotencyKey: `widget:${state.externalId}`,
      scale: "CSAT",
      score,
      visitorSessionToken: state.visitorSessionToken
    }
  });
  if (!data.ratingId) throw new Error("Rating was not confirmed by the server.");
  state.ratingSubmitted = true;
  if (ratingEl) ratingEl.hidden = true;
  appendSystemMessage("Спасибо, оценка сохранена.");
}

function startPolling() {
  stopPolling();
  state.pollTimer = window.setInterval(() => {
    pollOperatorReplies().catch(() => {});
  }, POLL_INTERVAL_MS);
}

function stopPolling() {
  if (state.pollTimer != null) {
    window.clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
}

function open() {
  state.panelOpen = true;
  if (rootEl) {
    rootEl.classList.add("sw-open");
  }
  if (inputEl) {
    inputEl.focus();
  }
}

function close() {
  state.panelOpen = false;
  if (rootEl) {
    rootEl.classList.remove("sw-open");
  }
}

function destroy() {
  stopPolling();
  stopInvitationPolling();
  stopPresence();
  sendDisconnect();
  if (state.presenceListenersAttached) {
    document.removeEventListener("visibilitychange", handlePageUpdate);
    window.removeEventListener("pageshow", handlePageUpdate);
    window.removeEventListener("pagehide", handlePageHide);
    state.presenceListenersAttached = false;
  }
  if (rootEl?.parentNode) {
    rootEl.parentNode.removeChild(rootEl);
  }
  rootEl = null;
  messagesEl = null;
  inputEl = null;
  sendBtn = null;
  toggleBtn = null;
  ratingEl = null;
  invitationEl = null;
  state.currentInvitation = null;
}

function normalizeInterval(value) {
  const interval = Number(value);
  return Number.isFinite(interval) && interval >= 5000 ? interval : PRESENCE_INTERVAL_MS;
}

function getOrCreateIdentity(storage, key, prefix) {
  try {
    const existing = String(storage?.getItem(key) ?? "").trim();
    if (existing) return existing;
    const identity = createIdentity(prefix);
    storage?.setItem(key, identity);
    return identity;
  } catch {
    return createIdentity(prefix);
  }
}

function createIdentity(prefix) {
  const randomId = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${randomId}`;
}

function firstInvitation(value) {
  if (!Array.isArray(value)) return null;
  return value.find((invitation) => invitation && typeof invitation.exposureId === "string" && invitation.exposureId.trim()) ?? null;
}

function invitationAcknowledgePath(exposureId, action) {
  return `/public/sdk/invitations/${encodeURIComponent(exposureId)}/${action}`;
}

export const __test__ = { downloadableAttachments, firstInvitation, formatAttachmentSize, getOrCreateIdentity, invitationAcknowledgePath, normalizeInterval };

function renderShell() {
  if (rootEl) {
    return;
  }

  rootEl = document.createElement("div");
  rootEl.className = "support-widget";
  rootEl.innerHTML = `
    <button type="button" class="sw-toggle" aria-label="Открыть чат поддержки">💬</button>
    <section class="sw-panel" aria-label="Чат поддержки">
      <header class="sw-header">
        <strong>Поддержка</strong>
        <button type="button" class="sw-close" aria-label="Закрыть">×</button>
      </header>
      <div class="sw-messages" role="log" aria-live="polite"></div>
      <div class="sw-rating" hidden>
        <span>Оцените помощь</span>
        <div>${[1, 2, 3, 4, 5].map((score) => `<button type="button" data-score="${score}" aria-label="Оценка ${score} из 5">${score}</button>`).join("")}</div>
      </div>
      <form class="sw-composer">
        <textarea class="sw-input" rows="2" placeholder="Напишите сообщение…" required></textarea>
        <button type="submit" class="sw-send">Отправить</button>
      </form>
    </section>
  `;

  document.body.appendChild(rootEl);

  toggleBtn = rootEl.querySelector(".sw-toggle");
  messagesEl = rootEl.querySelector(".sw-messages");
  inputEl = rootEl.querySelector(".sw-input");
  sendBtn = rootEl.querySelector(".sw-send");
  ratingEl = rootEl.querySelector(".sw-rating");
  const closeBtn = rootEl.querySelector(".sw-close");
  const form = rootEl.querySelector(".sw-composer");

  toggleBtn.addEventListener("click", () => {
    if (state.panelOpen) {
      close();
    } else {
      open();
    }
  });
  closeBtn.addEventListener("click", close);
  ratingEl.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-score]");
    if (!button || state.ratingSubmitted) return;
    const buttons = [...ratingEl.querySelectorAll("button")];
    buttons.forEach((item) => { item.disabled = true; });
    try {
      await sendQualityRating(Number(button.dataset.score));
    } catch (error) {
      appendSystemMessage(`Не удалось сохранить оценку: ${error.message}`);
      buttons.forEach((item) => { item.disabled = false; });
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = inputEl.value.trim();
    if (!text || sendBtn.disabled) {
      return;
    }

    sendBtn.disabled = true;
    appendMessage("visitor", text);
    inputEl.value = "";

    try {
      await sendVisitorMessage(text);
      await pollOperatorReplies();
    } catch (error) {
      appendSystemMessage(`Ошибка отправки: ${error.message}`);
    } finally {
      sendBtn.disabled = false;
      inputEl.focus();
    }
  });
}

function appendMessage(role, text, id, attachments) {
  const files = downloadableAttachments(attachments);
  if (!messagesEl || (!text && !files.length)) {
    return;
  }

  if (id && state.messages.some((message) => message.id === id)) {
    return;
  }

  const entry = { role, text, id: id ?? `local-${Date.now()}-${Math.random()}` };
  state.messages.push(entry);

  const bubble = document.createElement("div");
  bubble.className = `sw-message sw-message--${role}`;
  if (text) {
    const textEl = document.createElement("div");
    textEl.className = "sw-message__text";
    textEl.textContent = text;
    bubble.appendChild(textEl);
  }
  if (files.length) {
    bubble.appendChild(renderAttachmentList(files));
  }
  messagesEl.appendChild(bubble);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function downloadableAttachments(attachments) {
  if (!Array.isArray(attachments)) {
    return [];
  }
  return attachments.filter((attachment) => {
    const url = String(attachment?.download?.url ?? "").trim();
    return /^https?:\/\//i.test(url);
  });
}

function renderAttachmentList(files) {
  const list = document.createElement("div");
  list.className = "sw-attachments";
  for (const file of files) {
    const link = document.createElement("a");
    link.className = "sw-attachment";
    link.href = String(file.download.url);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    const name = String(file.fileName ?? "").trim() || "Файл";
    const size = formatAttachmentSize(file.sizeBytes);
    link.textContent = size ? `${name} (${size})` : name;
    if (file.mimeType) {
      link.title = String(file.mimeType);
    }
    list.appendChild(link);
  }
  return list;
}

function formatAttachmentSize(sizeBytes) {
  const size = Number(sizeBytes);
  if (!Number.isFinite(size) || size <= 0) {
    return "";
  }
  if (size < 1024) {
    return `${size} Б`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} КБ`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} МБ`;
}

function appendSystemMessage(text) {
  if (!messagesEl) {
    return;
  }

  const note = document.createElement("div");
  note.className = "sw-message sw-message--system";
  note.textContent = text;
  messagesEl.appendChild(note);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function injectStyles() {
  if (document.getElementById("support-widget-styles")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "support-widget-styles";
  style.textContent = `
    .support-widget {
      position: fixed;
      right: 20px;
      bottom: 20px;
      z-index: 2147483000;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      font-size: 14px;
      color: #0f172a;
    }
    .support-widget .sw-toggle {
      width: 56px;
      height: 56px;
      border: none;
      border-radius: 999px;
      background: #2563eb;
      color: #fff;
      font-size: 24px;
      cursor: pointer;
      box-shadow: 0 8px 24px rgba(37, 99, 235, 0.35);
    }
    .support-widget .sw-panel {
      display: none;
      position: absolute;
      right: 0;
      bottom: 68px;
      width: min(360px, calc(100vw - 40px));
      height: 480px;
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      box-shadow: 0 16px 40px rgba(15, 23, 42, 0.18);
      overflow: hidden;
      flex-direction: column;
    }
    .support-widget.sw-open .sw-panel {
      display: flex;
    }
    .support-widget .sw-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 14px;
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
    }
    .support-widget .sw-close {
      border: none;
      background: transparent;
      font-size: 22px;
      line-height: 1;
      cursor: pointer;
      color: #64748b;
    }
    .support-widget .sw-messages {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
      background: #f1f5f9;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .support-widget .sw-rating {
      padding: 10px 12px;
      border-top: 1px solid #d9e0ea;
      background: #f8fafc;
      text-align: center;
    }

    .support-widget .sw-rating[hidden] { display: none; }
    .support-widget .sw-rating span { display: block; margin-bottom: 8px; font-size: 13px; }
    .support-widget .sw-rating div { display: flex; justify-content: center; gap: 6px; }
    .support-widget .sw-rating button { width: 34px; height: 34px; border: 1px solid #b8c4d4; border-radius: 6px; background: #fff; cursor: pointer; }
    .support-widget .sw-invitation {
      position: absolute;
      right: 0;
      bottom: 68px;
      width: min(320px, calc(100vw - 40px));
      padding: 12px;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      background: #fff;
      box-shadow: 0 10px 28px rgba(15, 23, 42, 0.18);
    }
    .support-widget .sw-invitation p { margin: 0 0 10px; line-height: 1.4; }
    .support-widget .sw-invitation div { display: flex; justify-content: flex-end; gap: 8px; }
    .support-widget .sw-invitation button { border: 1px solid #b8c4d4; border-radius: 6px; background: #fff; padding: 7px 10px; cursor: pointer; }
    .support-widget .sw-invitation .sw-invitation__accept { border-color: #2563eb; background: #2563eb; color: #fff; }
    .support-widget .sw-message {
      max-width: 85%;
      padding: 8px 12px;
      border-radius: 12px;
      line-height: 1.4;
      word-break: break-word;
    }
    .support-widget .sw-message--visitor {
      align-self: flex-end;
      background: #2563eb;
      color: #fff;
      border-bottom-right-radius: 4px;
    }
    .support-widget .sw-message--operator {
      align-self: flex-start;
      background: #fff;
      border: 1px solid #e2e8f0;
      border-bottom-left-radius: 4px;
    }
    .support-widget .sw-attachments {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-top: 6px;
    }
    .support-widget .sw-message__text + .sw-attachments {
      border-top: 1px solid rgba(148, 163, 184, 0.35);
      padding-top: 6px;
    }
    .support-widget .sw-attachment {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: #2563eb;
      font-size: 13px;
      text-decoration: underline;
      word-break: break-all;
    }
    .support-widget .sw-attachment::before {
      content: "📎";
      text-decoration: none;
    }
    .support-widget .sw-message--system {
      align-self: center;
      background: #fef3c7;
      color: #92400e;
      font-size: 12px;
    }
    .support-widget .sw-composer {
      display: flex;
      gap: 8px;
      padding: 10px;
      border-top: 1px solid #e2e8f0;
      background: #fff;
    }
    .support-widget .sw-input {
      flex: 1;
      resize: none;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      padding: 8px 10px;
      font: inherit;
    }
    .support-widget .sw-send {
      border: none;
      border-radius: 10px;
      background: #2563eb;
      color: #fff;
      padding: 0 14px;
      font-weight: 600;
      cursor: pointer;
    }
    .support-widget .sw-send:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  `;
  document.head.appendChild(style);
}
