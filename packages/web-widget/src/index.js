const POLL_INTERVAL_MS = 3000;
const INVITATION_POLL_INTERVAL_MS = 5000;
const PRESENCE_INTERVAL_MS = 15000;
const AGENTS_STATUS_INTERVAL_MS = 30000;
const MAX_POLL_BACKOFF_MS = 5 * 60 * 1000;
const DEFAULT_ENVIRONMENT = "production";
const SUBJECT_STORAGE_KEY = "support-widget:subject-id";
const SESSION_STORAGE_KEY = "support-widget:session-id";
const UTM_STORAGE_KEY = "support-widget:utm";
const USER_TOKEN_STORAGE_KEY = "support-widget:user-token";
const SCRIPT_STYLE_NONCE = typeof document !== "undefined" ? String(document.currentScript?.nonce ?? "").trim() : "";

const state = {
  apiBase: "",
  publicKey: "",
  externalId: "",
  tenantId: "",
  integrationId: "",
  environment: DEFAULT_ENVIRONMENT,
  subjectId: null,
  sessionId: null,
  styleNonce: SCRIPT_STYLE_NONCE,
  presencePath: "/public/sdk/presence/heartbeat",
  disconnectPath: "/public/sdk/presence/disconnect",
  presenceIntervalMs: PRESENCE_INTERVAL_MS,
  presenceTimer: null,
  presenceFailures: 0,
  presencePollGeneration: 0,
  presenceListenersAttached: false,
  conversationId: null,
  visitorSessionToken: null,
  visitorTokenErrorShown: false,
  lastOperatorMessageId: null,
  pollTimer: null,
  pollFailures: 0,
  messagePollGeneration: 0,
  invitationPollTimer: null,
  invitationPollFailures: 0,
  invitationPollGeneration: 0,
  currentInvitation: null,
  messages: [],
  panelOpen: false,
  initialized: false,
  ratingSubmitted: false,
  // После оценки закрытый диалог ждет комментарий: следующее сообщение уйдет
  // как отзыв (без нового обращения), пока клиент не нажмет «Новое обращение».
  feedbackPending: false,
  // Page API (sw_api) state.
  agentsOnline: null,
  agentsStatusTimer: null,
  contactInfo: {},
  firstMessageSent: false,
  lastInitOptions: null,
  operatorAccepted: false,
  pageTitleOverride: null,
  pageUrlOverride: null,
  pollingErrorKeys: new Set(),
  unreadCount: 0,
  userToken: "",
  utm: null,
  visitorNumber: null,
  pendingFiles: []
};

let rootEl = null;
let messagesEl = null;
let inputEl = null;
let sendBtn = null;
let toggleBtn = null;
let ratingEl = null;
let feedbackEl = null;
let invitationEl = null;

function createWidgetIcon(paths, label) {
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("aria-hidden", label ? "false" : "true");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("width", "20");
  icon.setAttribute("height", "20");
  icon.setAttribute("fill", "none");
  icon.setAttribute("stroke", "currentColor");
  icon.setAttribute("stroke-width", "2");
  icon.setAttribute("stroke-linecap", "round");
  icon.setAttribute("stroke-linejoin", "round");
  if (label) icon.setAttribute("aria-label", label);
  for (const d of paths) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    icon.appendChild(path);
  }
  return icon;
}

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
  state.styleNonce = String(options.styleNonce ?? SCRIPT_STYLE_NONCE).trim();

  injectStyles();
  renderShell();
  startPresence();
  startInvitationPolling();

  // Presence intentionally starts before a conversation exists. The first
  // message or an accepted proactive invitation creates the conversation.
  state.initialized = true;
  startPolling();

  state.lastInitOptions = { ...options };
  state.userToken = readStoredValue(localStorage, USER_TOKEN_STORAGE_KEY);
  captureUtm();
  startAgentsStatusPolling();
  if (options.pageApi !== false) {
    installPageApi();
  }

  return { open, close, destroy };
}

function buildUrl(path, query = {}) {
  const browserBase = typeof document !== "undefined"
    ? document.baseURI
    : (typeof window !== "undefined" ? window.location?.href : "http://local.widget/");
  const url = new URL(resolveWidgetUrl(state.apiBase, path, browserBase));
  url.searchParams.set("environment", state.environment);
  for (const [key, value] of Object.entries(query)) {
    if (value != null && String(value).length > 0) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function resolveWidgetUrl(apiBase, path, browserBase = "http://local.widget/") {
  const normalizedBase = String(apiBase ?? "").trim().replace(/\/+$/, "");
  const normalizedPath = String(path ?? "").trim();
  const joined = `${normalizedBase}${normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`}`;
  return new URL(joined, browserBase).toString();
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
    const error = new Error(message);
    error.code = envelope.error?.code ?? `http_${response.status}`;
    error.httpStatus = response.status;
    throw error;
  }

  return envelope.data ?? {};
}

async function sendVisitorMessage(text, attachments = []) {
  const data = await apiRequest("POST", "/public/sdk/messages", {
    body: {
      conversationId: state.conversationId,
      externalId: state.externalId,
      pageUrl: state.pageUrlOverride ?? (typeof window !== "undefined" ? window.location.href : undefined),
      text,
      ...(attachments.length ? { attachments } : {})
    }
  });

  if (data.conversationId) {
    setConversationId(data.conversationId);
  }
  if (data.visitorSessionToken) {
    state.visitorSessionToken = data.visitorSessionToken;
    state.visitorTokenErrorShown = false;
  }

  if (!state.firstMessageSent) {
    state.firstMessageSent = true;
    callPageCallback("onMessageSent");
    callPageCallback("onClientStartChat");
  }

  return data;
}

async function uploadVisitorFile(file) {
  if (!(file instanceof File) || file.size <= 0) throw new Error("Выберите непустой файл.");
  const descriptor = await apiRequest("POST", "/public/sdk/uploads", {
    body: { fileName: file.name, mimeType: file.type || "application/octet-stream", sizeBytes: file.size }
  });
  const upload = descriptor.signedUpload;
  if (!descriptor.fileId || !upload?.url || upload.method !== "PUT") throw new Error("Сервер не выдал URL для загрузки файла.");
  const response = await fetch(upload.url, { method: upload.method, headers: upload.headers ?? {}, body: file });
  if (!response.ok) throw new Error(`Не удалось загрузить файл (${response.status}).`);
  const finalized = await apiRequest("POST", `/public/sdk/uploads/${encodeURIComponent(descriptor.fileId)}/finalize`, { body: {} });
  if (finalized.storageState !== "uploaded") throw new Error("Сервер не подтвердил загрузку файла.");
  return { fileId: descriptor.fileId, fileName: descriptor.fileName ?? file.name, mimeType: descriptor.mimeType ?? file.type, sizeBytes: descriptor.sizeBytes ?? file.size };
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

  if (data.visitorSessionToken) {
    state.visitorSessionToken = data.visitorSessionToken;
    state.visitorTokenErrorShown = false;
  }

  const replies = Array.isArray(data.messages) ? data.messages : [];
  for (const reply of replies) {
    const isNew = !reply.id || !state.messages.some((message) => message.id === String(reply.id));
    appendMessage("operator", reply.text, reply.id, reply.attachments);
    if (reply.id) {
      state.lastOperatorMessageId = String(reply.id);
    }
    if (isNew) {
      if (!state.panelOpen) {
        state.unreadCount += 1;
      }
      callPageCallback("onMessageReceived");
    }
  }
  if (["assigned", "transferred"].includes(String(data.conversationStatus)) && !state.operatorAccepted) {
    state.operatorAccepted = true;
    callPageCallback("onAccept");
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
    pageUrl: state.pageUrlOverride ?? location?.href,
    pagePath: location?.pathname,
    pageTitle: state.pageTitleOverride ?? (typeof document !== "undefined" ? document.title : undefined),
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
  state.invitationPollFailures = 0;
  state.invitationPollTimer = 0;
  void runInvitationPollLoop(state.invitationPollGeneration);
}

async function runInvitationPollLoop(generation) {
  if (state.invitationPollTimer == null || generation !== state.invitationPollGeneration) return;
  try {
    await pollInvitations();
    state.invitationPollFailures = 0;
    clearWidgetPollingError("invitations");
  } catch (error) {
    state.invitationPollFailures += 1;
    reportWidgetPollingError("invitations", error);
  }
  if (state.invitationPollTimer != null && generation === state.invitationPollGeneration) {
    state.invitationPollTimer = window.setTimeout(
      () => runInvitationPollLoop(generation),
      nextPollingDelay(INVITATION_POLL_INTERVAL_MS, state.invitationPollFailures)
    );
  }
}

function stopInvitationPolling() {
  state.invitationPollGeneration += 1;
  if (state.invitationPollTimer != null) {
    window.clearTimeout(state.invitationPollTimer);
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

  if (!isLocalInvitation(invitation)) {
    acknowledgeInvitation(invitation.exposureId, "shown").catch(() => {});
  }
  dismissButton.addEventListener("click", () => handleInvitationAction("dismissed", dismissButton, acceptButton));
  acceptButton.addEventListener("click", () => handleInvitationAction("accepted", dismissButton, acceptButton));
}

async function handleInvitationAction(action, ...buttons) {
  const invitation = state.currentInvitation;
  if (!invitation) return;
  buttons.forEach((button) => { button.disabled = true; });
  if (isLocalInvitation(invitation)) {
    // Invitations raised from the page API live only in the browser.
    if (action === "accepted") {
      open();
    }
    clearInvitation();
    return;
  }
  try {
    const data = await acknowledgeInvitation(invitation.exposureId, action);
    if (action === "accepted") {
      const acceptedSession = acceptedInvitationSession(data);
      setConversationId(acceptedSession.conversationId);
      state.visitorSessionToken = acceptedSession.visitorSessionToken;
      state.visitorTokenErrorShown = false;
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
  stopAgentsStatusPolling();
  state.presenceFailures = 0;
  state.presenceTimer = 0;
  void runPresenceLoop(state.presencePollGeneration);
  if (!state.presenceListenersAttached) {
    document.addEventListener("visibilitychange", handlePageUpdate);
    window.addEventListener("pageshow", handlePageUpdate);
    window.addEventListener("pagehide", handlePageHide);
    state.presenceListenersAttached = true;
  }
}

async function runPresenceLoop(generation) {
  if (state.presenceTimer == null || generation !== state.presencePollGeneration) return;
  try {
    await sendPresenceHeartbeat();
    state.presenceFailures = 0;
    clearWidgetPollingError("presence");
  } catch (error) {
    state.presenceFailures += 1;
    reportWidgetPollingError("presence", error);
  }
  if (state.presenceTimer != null && generation === state.presencePollGeneration) {
    state.presenceTimer = window.setTimeout(
      () => runPresenceLoop(generation),
      nextPollingDelay(state.presenceIntervalMs, state.presenceFailures)
    );
  }
}

function stopPresence() {
  state.presencePollGeneration += 1;
  if (state.presenceTimer != null) {
    window.clearTimeout(state.presenceTimer);
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
  if (data.feedback?.offered) {
    showFeedbackPrompt();
  }
}

function showFeedbackPrompt() {
  state.feedbackPending = true;
  if (feedbackEl) feedbackEl.hidden = false;
}

function hideFeedbackPrompt() {
  state.feedbackPending = false;
  if (feedbackEl) feedbackEl.hidden = true;
}

// «Новое обращение»: клиент не хочет оставлять отзыв — снимаем ожидание на
// сервере, чтобы следующее сообщение открыло новое обращение.
async function declineFeedbackPrompt(button) {
  if (button) button.disabled = true;
  try {
    await apiRequest("POST", `/public/sdk/conversations/${encodeURIComponent(state.conversationId)}/csat-feedback/decline`, {
      body: { visitorSessionToken: state.visitorSessionToken }
    });
    hideFeedbackPrompt();
    appendSystemMessage("Напишите сообщение — и мы откроем новое обращение.");
    if (inputEl) inputEl.focus();
  } catch (error) {
    appendSystemMessage(`Не удалось отключить отзыв: ${error.message}`);
  } finally {
    if (button) button.disabled = false;
  }
}

function startPolling() {
  stopPolling();
  state.pollFailures = 0;
  const generation = state.messagePollGeneration;
  state.pollTimer = window.setTimeout(() => runOperatorPollLoop(generation), POLL_INTERVAL_MS);
}

async function runOperatorPollLoop(generation) {
  if (state.pollTimer == null || generation !== state.messagePollGeneration) return;
  try {
    await pollOperatorReplies();
    state.pollFailures = 0;
    clearWidgetPollingError("messages");
  } catch (error) {
    state.pollFailures += 1;
    handlePollError(error);
    reportWidgetPollingError("messages", error);
  }
  if (state.pollTimer != null && generation === state.messagePollGeneration) {
    state.pollTimer = window.setTimeout(
      () => runOperatorPollLoop(generation),
      nextPollingDelay(POLL_INTERVAL_MS, state.pollFailures)
    );
  }
}

function handlePollError(error) {
  if (!["visitor_session_token_expired", "visitor_session_token_invalid", "visitor_session_token_malformed", "visitor_session_token_scope_mismatch"].includes(error?.code)) {
    return;
  }
  state.visitorSessionToken = null;
  if (!state.visitorTokenErrorShown) {
    state.visitorTokenErrorShown = true;
    appendSystemMessage("Сессия чата истекла. Отправьте новое сообщение, чтобы безопасно продолжить диалог.");
  }
}

function stopPolling() {
  state.messagePollGeneration += 1;
  if (state.pollTimer != null) {
    window.clearTimeout(state.pollTimer);
    state.pollTimer = null;
  }
}

function nextPollingDelay(baseIntervalMs, consecutiveFailures) {
  const base = Math.max(1000, Number(baseIntervalMs) || 1000);
  const exponent = Math.min(8, Math.max(0, Math.floor(Number(consecutiveFailures) || 0)));
  return Math.min(MAX_POLL_BACKOFF_MS, base * (2 ** exponent));
}

function reportWidgetPollingError(kind, error) {
  const code = String(error?.code ?? `http_${error?.httpStatus ?? "network"}`).slice(0, 80);
  const key = `${kind}:${code}`;
  if (state.pollingErrorKeys.has(key)) return;
  state.pollingErrorKeys.add(key);
  console.warn(`[SupportWidget] ${kind} polling failed (${code}); retries will use exponential backoff.`);
}

function clearWidgetPollingError(kind) {
  for (const key of state.pollingErrorKeys) {
    if (key.startsWith(`${kind}:`)) state.pollingErrorKeys.delete(key);
  }
}

function open() {
  state.panelOpen = true;
  state.unreadCount = 0;
  if (rootEl) {
    rootEl.classList.add("sw-open");
  }
  toggleBtn?.setAttribute("aria-expanded", "true");
  if (inputEl) {
    inputEl.focus();
  }
  callPageCallback("onOpen");
  callPageCallback("onChangeState", "chat");
  callPageCallback("onResizeCallback");
}

function close() {
  state.panelOpen = false;
  if (rootEl) {
    rootEl.classList.remove("sw-open");
  }
  toggleBtn?.setAttribute("aria-expanded", "false");
  callPageCallback("onClose");
  callPageCallback("onChangeState", "label");
  callPageCallback("onResizeCallback");
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
  feedbackEl = null;
  invitationEl = null;
  state.currentInvitation = null;
  state.feedbackPending = false;
  state.initialized = false;
  callPageCallback("onWidgetDestroy");
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

function acceptedInvitationSession(data) {
  const conversationId = String(data?.conversationId ?? "").trim();
  const visitorSessionToken = String(data?.visitorSessionToken ?? "").trim();
  if (!conversationId || !visitorSessionToken) {
    throw new Error("Invitation acceptance did not include a conversation session.");
  }
  return { conversationId, visitorSessionToken };
}

function resetWidgetIdentity(target, local, session) {
  writeStoredValue(local, SUBJECT_STORAGE_KEY, "");
  writeStoredValue(session, SESSION_STORAGE_KEY, "");
  target.subjectId = getOrCreateIdentity(local, SUBJECT_STORAGE_KEY, "visitor");
  target.sessionId = getOrCreateIdentity(session, SESSION_STORAGE_KEY, "session");
  target.externalId = target.subjectId;
}

// --- Page API (window.sw_api) ---------------------------------------------
// Site code controls the widget through a global object and page-level
// callbacks. Alias prefixes keep drop-in compatibility for sites migrating
// from third-party chat widgets: every callback and global is exposed under
// each prefix, so existing integrations only swap keys and endpoints.

const PAGE_API_PREFIXES = ["sw", "jivo"];

function callPageCallback(name, ...args) {
  if (typeof window === "undefined") return;
  for (const prefix of PAGE_API_PREFIXES) {
    const handler = window[`${prefix}_${name}`];
    if (typeof handler === "function") {
      try {
        handler(...args);
      } catch {
        // Page callbacks must never break the widget loop.
      }
    }
  }
}

function isLocalInvitation(invitation) {
  return typeof invitation?.exposureId === "string" && invitation.exposureId.startsWith("local-");
}

function readStoredValue(storage, key) {
  try {
    return String(storage?.getItem(key) ?? "").trim();
  } catch {
    return "";
  }
}

function writeStoredValue(storage, key, value) {
  try {
    if (value) {
      storage?.setItem(key, value);
    } else {
      storage?.removeItem(key);
    }
  } catch {
    // Storage may be unavailable (private mode); the widget keeps working.
  }
}

function parseUtmParams(search) {
  const params = new URLSearchParams(String(search ?? ""));
  const utm = {};
  for (const key of ["campaign", "content", "medium", "source", "term"]) {
    const value = String(params.get(`utm_${key}`) ?? "").trim();
    if (value) {
      utm[key] = value;
    }
  }
  return Object.keys(utm).length ? utm : null;
}

function captureUtm() {
  const stored = readStoredValue(localStorage, UTM_STORAGE_KEY);
  if (stored) {
    try {
      state.utm = JSON.parse(stored);
      return;
    } catch {
      // Ignore a corrupted value and re-capture below.
    }
  }
  const parsed = typeof window !== "undefined" ? parseUtmParams(window.location?.search) : null;
  if (parsed) {
    state.utm = parsed;
    writeStoredValue(localStorage, UTM_STORAGE_KEY, JSON.stringify(parsed));
  }
}

async function refreshAgentsStatus() {
  try {
    const data = await apiRequest("GET", "/public/sdk/agents/status");
    state.agentsOnline = data.agentsOnline === true;
  } catch {
    state.agentsOnline = null;
  }
}

function startAgentsStatusPolling() {
  stopAgentsStatusPolling();
  void refreshAgentsStatus();
  state.agentsStatusTimer = window.setInterval(() => {
    void refreshAgentsStatus();
  }, AGENTS_STATUS_INTERVAL_MS);
}

function stopAgentsStatusPolling() {
  if (state.agentsStatusTimer != null) {
    window.clearInterval(state.agentsStatusTimer);
    state.agentsStatusTimer = null;
  }
}

function setConversationId(conversationId) {
  const changed = applyConversationIdentity(state, conversationId);
  if (changed && ratingEl) ratingEl.hidden = true;
  if (changed && feedbackEl) feedbackEl.hidden = true;
  return changed;
}

function applyConversationIdentity(target, conversationId) {
  const normalizedId = String(conversationId ?? "").trim();
  if (!normalizedId || normalizedId === target.conversationId) return false;
  target.conversationId = normalizedId;
  target.lastOperatorMessageId = null;
  target.operatorAccepted = false;
  target.ratingSubmitted = false;
  target.feedbackPending = false;
  return true;
}

async function sendClientInfo(partial = {}) {
  const data = await apiRequest("POST", "/public/sdk/client-info", {
    body: {
      conversationId: state.conversationId || undefined,
      externalId: state.externalId,
      pageTitle: state.pageTitleOverride ?? (typeof document !== "undefined" ? document.title : undefined),
      pageUrl: state.pageUrlOverride ?? (typeof window !== "undefined" ? window.location.href : undefined),
      ...partial
    }
  });
  if (data.conversationId) {
    setConversationId(data.conversationId);
  }
  if (data.visitorNumber !== undefined && data.visitorNumber !== null) {
    state.visitorNumber = Number(data.visitorNumber);
  }
  return data;
}

function createPageApi() {
  return {
    chatMode() {
      return state.agentsOnline === false ? "offline" : "online";
    },
    clearHistory() {
      resetWidgetIdentity(state, localStorage, sessionStorage);
      writeStoredValue(localStorage, USER_TOKEN_STORAGE_KEY, "");
      state.conversationId = null;
      state.visitorSessionToken = null;
      state.lastOperatorMessageId = null;
      state.messages = [];
      state.unreadCount = 0;
      state.firstMessageSent = false;
      state.operatorAccepted = false;
      state.ratingSubmitted = false;
      state.feedbackPending = false;
      if (feedbackEl) feedbackEl.hidden = true;
      state.contactInfo = {};
      state.userToken = "";
      if (messagesEl) {
        messagesEl.replaceChildren();
      }
      return { result: "ok" };
    },
    close() {
      close();
      return { result: "ok" };
    },
    getContactInfo() {
      return {
        client_name: state.contactInfo.name ?? null,
        description: state.contactInfo.description ?? null,
        email: state.contactInfo.email ?? null,
        phone: state.contactInfo.phone ?? null
      };
    },
    getUnreadMessagesCount() {
      return state.unreadCount;
    },
    getUtm() {
      return {
        campaign: state.utm?.campaign ?? null,
        content: state.utm?.content ?? null,
        medium: state.utm?.medium ?? null,
        source: state.utm?.source ?? null,
        term: state.utm?.term ?? null
      };
    },
    getVisitorNumber(callback) {
      const done = typeof callback === "function" ? callback : () => {};
      if (state.visitorNumber !== null) {
        done(null, state.visitorNumber);
        return;
      }
      sendClientInfo({})
        .then(() => done(null, state.visitorNumber))
        .catch((error) => done(error?.message ?? String(error)));
    },
    isCallbackEnabled(callback) {
      if (typeof callback === "function") {
        callback({ result: "fail", reason: "calls_not_available" });
      }
    },
    open(params = {}) {
      void params;
      open();
      return { result: "ok" };
    },
    sendOfflineMessage(payload = {}) {
      const message = String(payload.message ?? "").trim();
      if (!message) {
        return { result: "fail", error: "message_required" };
      }
      this.setContactInfo(payload);
      appendMessage("visitor", message);
      sendVisitorMessage(message).catch((error) => {
        appendSystemMessage(`Ошибка отправки: ${error.message}`);
      });
      return { result: "ok" };
    },
    sendPageTitle(title, fromApi, url) {
      void fromApi;
      state.pageTitleOverride = String(title ?? "").trim() || null;
      state.pageUrlOverride = String(url ?? "").trim() || null;
      sendPresenceHeartbeat().catch(() => {});
      return { result: "ok" };
    },
    setClientAttributes(attributes = {}) {
      sendClientInfo({ attributes }).catch(() => {});
      return { result: "ok" };
    },
    setContactInfo(info = {}) {
      const contact = {
        description: String(info.description ?? "").trim() || undefined,
        email: String(info.email ?? "").trim() || undefined,
        name: String(info.name ?? "").trim() || undefined,
        phone: String(info.phone ?? "").trim() || undefined
      };
      state.contactInfo = { ...state.contactInfo, ...contact };
      sendClientInfo({ contactInfo: contact }).catch(() => {});
      return { result: "ok" };
    },
    setCustomData(fields = []) {
      const customData = Array.isArray(fields) ? fields.slice(0, 10) : [];
      sendClientInfo({ customData }).catch(() => {});
      return { result: "ok" };
    },
    setRules() {
      return { result: "ok" };
    },
    setUserToken(token) {
      state.userToken = String(token ?? "").trim();
      writeStoredValue(localStorage, USER_TOKEN_STORAGE_KEY, state.userToken);
      sendClientInfo({ userToken: state.userToken }).catch(() => {});
      return { result: "ok" };
    },
    setWidgetColor(color, color2) {
      applyWidgetColor(color, color2);
      return { result: "ok" };
    },
    showProactiveInvitation(text, departmentId) {
      void departmentId;
      const message = String(text ?? "").trim();
      if (!message || state.currentInvitation) {
        return { result: "fail" };
      }
      renderInvitation({ exposureId: `local-${Date.now().toString(36)}`, message });
      return { result: "ok" };
    },
    startCall() {
      return { result: "fail", reason: "calls_not_available" };
    }
  };
}

function applyWidgetColor(color, color2) {
  const primary = normalizeWidgetColor(color);
  if (!primary || typeof document === "undefined") return;
  const secondary = normalizeWidgetColor(color2);
  const background = secondary
    ? `linear-gradient(135deg, ${primary}, ${secondary})`
    : primary;
  let style = document.getElementById("support-widget-color-override");
  if (!style) {
    style = document.createElement("style");
    style.id = "support-widget-color-override";
    applyStyleNonce(style);
    document.head.appendChild(style);
  }
  style.textContent = `
    .support-widget .sw-toggle,
    .support-widget .sw-send,
    .support-widget .sw-message--visitor,
    .support-widget .sw-invitation .sw-invitation__accept {
      background: ${background};
      border-color: transparent;
    }
  `;
}

function applyStyleNonce(style) {
  if (state.styleNonce) {
    style.setAttribute("nonce", state.styleNonce);
  }
}

function normalizeWidgetColor(value) {
  const color = String(value ?? "").trim();
  if (!color || /[;{}]/.test(color)) return "";
  if (typeof CSS !== "undefined" && typeof CSS.supports === "function") {
    return CSS.supports("color", color) ? color : "";
  }
  return /^(#[\da-f]{3,8}|(?:rgb|hsl)a?\([\d\s.,%+-]+\)|[a-z]+)$/i.test(color) ? color : "";
}

function installPageApi() {
  if (typeof window === "undefined") return;
  const api = createPageApi();
  for (const prefix of PAGE_API_PREFIXES) {
    if (!window[`${prefix}_api`]) {
      window[`${prefix}_api`] = api;
    }
    if (typeof window[`${prefix}_init`] !== "function") {
      window[`${prefix}_init`] = () => {
        if (!state.initialized && state.lastInitOptions) {
          init(state.lastInitOptions);
        }
      };
    }
    if (typeof window[`${prefix}_destroy`] !== "function") {
      window[`${prefix}_destroy`] = () => {
        destroy();
      };
    }
  }
  setTimeout(() => callPageCallback("onLoadCallback"), 0);
}

export const __test__ = { acceptedInvitationSession, applyConversationIdentity, callPageCallback, createPageApi, defaultEnvironment: DEFAULT_ENVIRONMENT, downloadableAttachments, firstInvitation, formatAttachmentSize, getOrCreateIdentity, invitationAcknowledgePath, isLocalInvitation, nextPollingDelay, normalizeInterval, normalizeWidgetColor, parseUtmParams, resetWidgetIdentity, resolveWidgetUrl };

function renderShell() {
  if (rootEl) {
    return;
  }

  rootEl = document.createElement("div");
  rootEl.className = "support-widget";
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "sw-toggle";
  toggle.setAttribute("aria-label", "Открыть чат поддержки");
  toggle.setAttribute("aria-controls", "support-widget-panel");
  toggle.setAttribute("aria-expanded", "false");
  toggle.replaceChildren(createWidgetIcon(["M21 11.5a8.4 8.4 0 0 1-8.7 8.4 9.5 9.5 0 0 1-4.5-1.1L3 20l1.2-4.2A8.1 8.1 0 0 1 3 11.5 8.4 8.4 0 0 1 11.7 3 8.4 8.4 0 0 1 21 11.5Z"]));
  const panel = document.createElement("section");
  panel.className = "sw-panel";
  panel.id = "support-widget-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "false");
  panel.setAttribute("aria-label", "Чат поддержки");
  const header = document.createElement("header");
  header.className = "sw-header";
  const headerCopy = document.createElement("div");
  headerCopy.className = "sw-header-copy";
  const title = document.createElement("strong");
  title.textContent = "Поддержка";
  const subtitle = document.createElement("small");
  subtitle.textContent = "Обычно отвечаем в течение нескольких минут";
  headerCopy.append(title, subtitle);
  const close = document.createElement("button");
  close.type = "button";
  close.className = "sw-close";
  close.setAttribute("aria-label", "Закрыть");
  close.replaceChildren(createWidgetIcon(["M6 6l12 12", "M18 6 6 18"]));
  header.append(headerCopy, close);
  const messages = document.createElement("div");
  messages.className = "sw-messages";
  messages.setAttribute("role", "log");
  messages.setAttribute("aria-live", "polite");
  const rating = document.createElement("div");
  rating.className = "sw-rating";
  rating.hidden = true;
  const ratingLabel = document.createElement("span");
  ratingLabel.textContent = "Оцените помощь";
  const ratingButtons = document.createElement("div");
  for (const score of [1, 2, 3, 4, 5]) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.score = String(score);
    button.setAttribute("aria-label", `Оценка ${score} из 5`);
    button.textContent = String(score);
    ratingButtons.appendChild(button);
  }
  rating.append(ratingLabel, ratingButtons);
  const feedback = document.createElement("div");
  feedback.className = "sw-feedback";
  feedback.hidden = true;
  const feedbackLabel = document.createElement("span");
  feedbackLabel.textContent = "Хотите оставить отзыв? Напишите его сообщением — мы передадим команде.";
  const feedbackNewAppeal = document.createElement("button");
  feedbackNewAppeal.type = "button";
  feedbackNewAppeal.className = "sw-feedback__new-appeal";
  feedbackNewAppeal.textContent = "Новое обращение";
  feedback.append(feedbackLabel, feedbackNewAppeal);
  const composer = document.createElement("form");
  composer.className = "sw-composer";
  const textarea = document.createElement("textarea");
  textarea.className = "sw-input";
  textarea.rows = 2;
  textarea.placeholder = "Напишите сообщение…";
  textarea.required = false;
  const fileInput = document.createElement("input");
  fileInput.className = "sw-file-input";
  fileInput.type = "file";
  fileInput.setAttribute("aria-label", "Прикрепить файл");
  const attach = document.createElement("button");
  attach.type = "button";
  attach.className = "sw-attach";
  attach.setAttribute("aria-label", "Прикрепить файл");
  attach.replaceChildren(createWidgetIcon(["m21.4 11.6-8.8 8.8a6 6 0 0 1-8.5-8.5l8.8-8.8a4 4 0 0 1 5.7 5.7l-8.8 8.8a2 2 0 0 1-2.8-2.8l8.1-8.1"]));
  const send = document.createElement("button");
  send.type = "submit";
  send.className = "sw-send";
  send.setAttribute("aria-label", "Отправить сообщение");
  send.replaceChildren(createWidgetIcon(["m22 2-7 20-4-9-9-4Z", "m22 2-11 11"]));
  const pendingFiles = document.createElement("div");
  pendingFiles.className = "sw-pending-files";
  composer.append(pendingFiles, fileInput, attach, textarea, send);
  panel.append(header, messages, rating, feedback, composer);
  rootEl.append(toggle, panel);

  document.body.appendChild(rootEl);

  toggleBtn = rootEl.querySelector(".sw-toggle");
  messagesEl = rootEl.querySelector(".sw-messages");
  inputEl = rootEl.querySelector(".sw-input");
  sendBtn = rootEl.querySelector(".sw-send");
  ratingEl = rootEl.querySelector(".sw-rating");
  feedbackEl = rootEl.querySelector(".sw-feedback");
  const closeBtn = rootEl.querySelector(".sw-close");
  const form = rootEl.querySelector(".sw-composer");
  const filePicker = rootEl.querySelector(".sw-file-input");
  const attachBtn = rootEl.querySelector(".sw-attach");
  feedbackEl.querySelector(".sw-feedback__new-appeal").addEventListener("click", (event) => {
    void declineFeedbackPrompt(event.currentTarget);
  });

  toggleBtn.addEventListener("click", () => {
    if (state.panelOpen) {
      close();
    } else {
      open();
    }
  });
  closeBtn.addEventListener("click", close);
  attachBtn.addEventListener("click", () => filePicker.click());
  filePicker.addEventListener("change", () => {
    state.pendingFiles = [...filePicker.files];
    pendingFiles.replaceChildren(...state.pendingFiles.map((file) => {
      const chip = document.createElement("span");
      chip.className = "sw-pending-file";
      const name = document.createElement("span");
      name.textContent = file.name;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.setAttribute("aria-label", `Удалить файл ${file.name}`);
      remove.replaceChildren(createWidgetIcon(["M6 6l12 12", "M18 6 6 18"]));
      remove.addEventListener("click", () => {
        state.pendingFiles = state.pendingFiles.filter((item) => item !== file);
        chip.remove();
        if (!state.pendingFiles.length) filePicker.value = "";
      });
      chip.append(createWidgetIcon(["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z", "M14 2v6h6"]), name, remove);
      return chip;
    }));
  });
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
    const selectedFiles = state.pendingFiles;
    if ((!text && !selectedFiles.length) || sendBtn.disabled) {
      return;
    }

    sendBtn.disabled = true;
    const attachments = [];

    try {
      for (const file of selectedFiles) attachments.push(await uploadVisitorFile(file));
      appendMessage("visitor", text || "Файл", undefined, attachments);
      inputEl.value = "";
      filePicker.value = "";
      state.pendingFiles = [];
      pendingFiles.replaceChildren();
      const data = await sendVisitorMessage(text, attachments);
      if (data.recordedAsFeedback) {
        // Сообщение сохранено как отзыв к оценке: операторского ответа не
        // будет, подтверждаем сразу и возвращаем композер в обычный режим.
        hideFeedbackPrompt();
        appendSystemMessage(String(data.feedbackAck ?? "").trim() || "Спасибо за отзыв!");
      } else {
        await pollOperatorReplies();
      }
    } catch (error) {
      appendSystemMessage(`Ошибка отправки: ${error.message}`);
    } finally {
      sendBtn.disabled = false;
      inputEl.focus();
    }
  });
}

function appendMessage(role, text, id, attachments) {
  const files = Array.isArray(attachments) ? attachments : [];
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
    const url = String(file?.download?.url ?? "").trim();
    const link = document.createElement(url ? "a" : "span");
    link.className = "sw-attachment";
    if (url) {
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
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
  applyStyleNonce(style);
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
      display: inline-grid;
      width: 60px;
      height: 60px;
      place-items: center;
      border: none;
      border-radius: 999px;
      background: #2563eb;
      color: #fff;
      cursor: pointer;
      box-shadow: 0 8px 24px rgba(37, 99, 235, 0.35);
      transition: transform .18s ease, box-shadow .18s ease;
    }
    .support-widget .sw-toggle:hover { transform: translateY(-2px); box-shadow: 0 12px 28px rgba(37, 99, 235, .4); }
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
      padding: 15px 16px;
      background: #2563eb;
      color: #fff;
    }
    .support-widget .sw-header-copy { display: grid; gap: 3px; }
    .support-widget .sw-header-copy strong { font-size: 15px; line-height: 1.2; }
    .support-widget .sw-header-copy small { font-size: 11px; line-height: 1.3; opacity: .85; }
    .support-widget .sw-close {
      display: inline-grid;
      width: 36px;
      height: 36px;
      place-items: center;
      border: 1px solid rgba(255,255,255,.35);
      border-radius: 9px;
      background: rgba(255,255,255,.12);
      cursor: pointer;
      color: #fff;
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
    .support-widget .sw-feedback {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px;
      border-top: 1px solid #e2e8f0;
      background: #f0f9ff;
      font-size: 13px;
      color: #1e3a5f;
    }
    .support-widget .sw-feedback[hidden] { display: none; }
    .support-widget .sw-feedback span { flex: 1; line-height: 1.35; }
    .support-widget .sw-feedback .sw-feedback__new-appeal {
      flex-shrink: 0;
      border: 1px solid #b8c4d4;
      border-radius: 6px;
      background: #fff;
      padding: 7px 10px;
      cursor: pointer;
    }
    .support-widget .sw-feedback .sw-feedback__new-appeal:disabled { opacity: 0.6; cursor: default; }
    .support-widget .sw-composer { display: grid; grid-template-columns: 42px minmax(0, 1fr) 42px; gap: 8px; padding: 12px; border-top: 1px solid #e2e8f0; background: #fff; }
    .support-widget .sw-pending-files { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 6px; }
    .support-widget .sw-pending-file { display: inline-flex; min-width: 0; max-width: 100%; align-items: center; gap: 6px; padding: 6px 7px; border: 1px solid #c7d8f8; border-radius: 8px; background: #f5f9ff; color: #25466d; font-size: 12px; }
    .support-widget .sw-pending-file > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .support-widget .sw-pending-file button { display: inline-grid; width: 20px; height: 20px; flex: 0 0 auto; place-items: center; border: 0; border-radius: 5px; background: transparent; color: #5b7190; cursor: pointer; }
    .support-widget .sw-pending-file svg { width: 14px; height: 14px; }
    .support-widget .sw-file-input { display: none; }
    .support-widget .sw-attach {
      flex: 0 0 auto;
      width: 42px;
      height: 42px;
      display: inline-grid;
      place-items: center;
      border: 1px solid #9dbdf4;
      border-radius: 10px;
      background: #fff;
      color: #2563eb;
      cursor: pointer;
    }
    .support-widget .sw-input {
      flex: 1;
      resize: none;
      border: 1px solid #cbd5e1;
      min-height: 42px;
      border-radius: 10px;
      padding: 10px 11px;
      font: inherit;
    }
    .support-widget .sw-send {
      display: inline-grid;
      width: 42px;
      height: 42px;
      place-items: center;
      border: none;
      border-radius: 50%;
      background: #2563eb;
      color: #fff;
      cursor: pointer;
    }
    .support-widget .sw-send:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .support-widget button:focus-visible, .support-widget textarea:focus-visible, .support-widget a:focus-visible { outline: 3px solid rgba(59,130,246,.42); outline-offset: 2px; }
    @media (max-width: 480px) { .support-widget { right: 12px; bottom: 12px; } .support-widget .sw-panel { width: calc(100vw - 24px); height: min(560px, calc(100vh - 92px)); bottom: 72px; } }
    @media (prefers-reduced-motion: reduce) { .support-widget .sw-toggle { transition: none; } }
  `;
  document.head.appendChild(style);
}
