const POLL_INTERVAL_MS = 3000;
const DEFAULT_ENVIRONMENT = "stage";

const state = {
  apiBase: "",
  publicKey: "",
  externalId: "",
  environment: DEFAULT_ENVIRONMENT,
  conversationId: null,
  visitorSessionToken: null,
  lastOperatorMessageId: null,
  pollTimer: null,
  messages: [],
  panelOpen: false,
  initialized: false
};

let rootEl = null;
let messagesEl = null;
let inputEl = null;
let sendBtn = null;
let toggleBtn = null;

export function init(options = {}) {
  const apiBase = String(options.apiBase ?? "").trim().replace(/\/+$/, "");
  const publicKey = String(options.publicKey ?? "").trim();
  const externalId = String(options.externalId ?? "").trim();

  if (!apiBase || !publicKey || !externalId) {
    throw new Error("SupportWidget.init requires apiBase, publicKey, and externalId.");
  }

  state.apiBase = apiBase;
  state.publicKey = publicKey;
  state.externalId = externalId;
  state.environment = String(options.environment ?? DEFAULT_ENVIRONMENT).trim() || DEFAULT_ENVIRONMENT;

  injectStyles();
  renderShell();

  identifyVisitor()
    .then(() => {
      state.initialized = true;
      startPolling();
    })
    .catch((error) => {
      appendSystemMessage(`Не удалось подключиться: ${error.message}`);
    });

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

async function identifyVisitor() {
  const data = await apiRequest("POST", "/public/sdk/identify", {
    body: { externalId: state.externalId }
  });

  state.conversationId = data.conversationId ?? null;
  if (!state.conversationId) {
    throw new Error("Identify response did not include conversationId.");
  }
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
    appendMessage("operator", reply.text, reply.id);
    if (reply.id) {
      state.lastOperatorMessageId = String(reply.id);
    }
  }
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
  if (rootEl?.parentNode) {
    rootEl.parentNode.removeChild(rootEl);
  }
  rootEl = null;
  messagesEl = null;
  inputEl = null;
  sendBtn = null;
  toggleBtn = null;
}

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

function appendMessage(role, text, id) {
  if (!messagesEl || !text) {
    return;
  }

  if (id && state.messages.some((message) => message.id === id)) {
    return;
  }

  const entry = { role, text, id: id ?? `local-${Date.now()}-${Math.random()}` };
  state.messages.push(entry);

  const bubble = document.createElement("div");
  bubble.className = `sw-message sw-message--${role}`;
  bubble.textContent = text;
  messagesEl.appendChild(bubble);
  messagesEl.scrollTop = messagesEl.scrollHeight;
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
