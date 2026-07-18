import React from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Braces,
  Check,
  ChevronRight,
  Code2,
  Copy,
  ExternalLink,
  KeyRound,
  MessageSquare,
  Radio,
  ShieldCheck,
  Webhook
} from "lucide-react";
import "./api-docs.css";

const navigationItems = [
  { id: "overview", label: "Обзор" },
  { id: "authentication", label: "Авторизация" },
  { id: "web-sdk", label: "Web SDK" },
  { id: "messages", label: "Сообщения" },
  { id: "open-channel", label: "Open Channel" },
  { id: "webhooks", label: "Webhooks" }
];

const widgetExample = `<script defer src="https://cdn.example.com/support-widget.js"></script>
<script>
  SupportWidget.init({
    apiBase: "https://api.example.com/api/v1",
    publicKey: "sk_live_<public_api_key>",
    externalId: "customer_42",
    environment: "production"
  });
</script>`;

const identifyExample = `const apiBase = "https://api.example.com/api/v1";

const response = await fetch(
  \`\${apiBase}/public/sdk/identify?environment=production\`,
  {
    method: "POST",
    headers: {
      authorization: "Bearer sk_live_<public_api_key>",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      externalId: "customer_42",
      traits: { plan: "business", locale: "ru-RU" }
    })
  }
);

const result = await response.json();`;

const messageExample = `const response = await fetch(
  "https://api.example.com/api/v1/public/sdk/messages?environment=production",
  {
    method: "POST",
    headers: {
      authorization: "Bearer sk_live_<public_api_key>",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      externalId: "customer_42",
      pageUrl: window.location.href,
      text: "Подскажите статус заказа №1024"
    })
  }
);

const { data } = await response.json();
// data.conversationId и data.visitorSessionToken нужны для получения ответов.`;

const openChannelExample = `curl -X POST "https://api.example.com/api/v1/open-channel/<channel_token>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "sender": {
      "id": "customer_42",
      "name": "Анна Петрова",
      "email": "anna@example.com"
    },
    "message": {
      "type": "text",
      "id": "msg_1024",
      "date": 1760860800,
      "text": "Нужна помощь с заказом"
    }
  }'`;

const webhookExample = `import { createHmac, timingSafeEqual } from "node:crypto";

function verifyWebhook(rawBody, headers, secret) {
  const timestamp = headers["x-webhook-timestamp"];
  const signature = headers["x-webhook-signature"];
  const payload = \`\${timestamp}.\${rawBody}\`;
  const expected = \`sha256=\${createHmac("sha256", secret)
    .update(payload)
    .digest("hex")}\`;

  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

// Проверяйте также x-webhook-nonce и не принимайте повторные значения.`;

function scrollToSection(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function CodeExample({ code, language, title }) {
  const [copied, setCopied] = React.useState(false);

  async function copyCode() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = code;
        textArea.setAttribute("readonly", "");
        textArea.style.cssText = "position:fixed; opacity:0; pointer-events:none";
        document.body.append(textArea);
        textArea.select();
        const copiedToClipboard = document.execCommand("copy");
        textArea.remove();

        if (!copiedToClipboard) {
          throw new Error("Clipboard copy is unavailable");
        }
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="api-code-example" aria-label={`Пример: ${title}`}>
      <header>
        <span>{language}</span>
        <button aria-label={`Скопировать пример «${title}»`} onClick={copyCode} type="button">
          {copied ? <Check size={15} /> : <Copy size={15} />}
          {copied ? "Скопировано" : "Копировать"}
        </button>
      </header>
      <pre><code>{code}</code></pre>
    </section>
  );
}

function SectionLink({ id, label }) {
  return (
    <button onClick={() => scrollToSection(id)} type="button">
      <span>{label}</span>
      <ChevronRight aria-hidden="true" size={15} />
    </button>
  );
}

export function ApiDocsPage() {
  return (
    <main className="api-docs-page" data-testid="api-docs-page">
      <header className="api-docs-header">
        <a className="api-docs-brand" href="#/landing">
          <span>SC</span>
          <strong>Support Communication</strong>
        </a>
        <div className="api-docs-header-actions">
          <a className="api-docs-openapi-link" href="/api/docs" rel="noreferrer" target="_blank">
            OpenAPI
            <ExternalLink size={15} />
          </a>
          <a className="api-docs-back-link" href="#/landing">
            <ArrowLeft size={15} />
            На главную
          </a>
        </div>
      </header>

      <div className="api-docs-layout">
        <aside className="api-docs-sidebar" aria-label="Содержание API-документации">
          <div>
            <span className="api-docs-sidebar-label">Содержание</span>
            <nav>
              {navigationItems.map((item) => <SectionLink {...item} key={item.id} />)}
            </nav>
          </div>
          <a className="api-docs-sidebar-cta" href="/api/docs" rel="noreferrer" target="_blank">
            <BookOpen size={17} />
            <span>Полная спецификация</span>
            <ExternalLink size={14} />
          </a>
        </aside>

        <div className="api-docs-content">
          <section className="api-docs-hero" id="overview">
            <span className="api-docs-eyebrow"><Code2 size={15} /> Документация для разработчиков</span>
            <h1>Интеграции с API без лишней прослойки</h1>
            <p>
              Подключайте Web SDK, передавайте сообщения из своего приложения и принимайте события в привычном JSON-формате.
              Все примеры ниже используют тестовые значения — замените их своими ключами и адресами.
            </p>
            <div className="api-docs-hero-actions">
              <button className="api-docs-primary-button" onClick={() => scrollToSection("web-sdk")} type="button">
                Подключить Web SDK
                <ArrowRight size={17} />
              </button>
              <a className="api-docs-secondary-button" href="/api/docs" rel="noreferrer" target="_blank">
                Открыть OpenAPI
                <ExternalLink size={16} />
              </a>
            </div>
            <div className="api-docs-base-url" aria-label="Базовый адрес API">
              <span>Базовый URL</span>
              <code>https://api.example.com/api/v1</code>
            </div>
          </section>

          <section className="api-docs-section" id="authentication">
            <div className="api-docs-section-heading">
              <span className="api-docs-section-icon blue"><KeyRound size={19} /></span>
              <div>
                <p className="api-docs-kicker">01 · Начало работы</p>
                <h2>Авторизация и формат ответа</h2>
                <p>Создайте публичный ключ в настройках интеграции и передавайте его в заголовке каждого запроса.</p>
              </div>
            </div>
            <div className="api-docs-two-column">
              <div className="api-docs-prose-card">
                <h3>Три шага до первого запроса</h3>
                <ol className="api-docs-steps">
                  <li><span>1</span><p>Создайте подключение SDK или внешнего канала в настройках рабочего пространства.</p></li>
                  <li><span>2</span><p>Сохраните ключ при создании: далее в интерфейсе видна только его маска.</p></li>
                  <li><span>3</span><p>Укажите среду <code>stage</code> для тестов и <code>production</code> для боевого трафика.</p></li>
                </ol>
              </div>
              <div className="api-docs-callout">
                <ShieldCheck size={21} />
                <div>
                  <strong>Безопасность ключа</strong>
                  <p>Не передавайте ключи с правами оператора в браузер и не добавляйте действующие токены в репозиторий, тикеты или логи.</p>
                </div>
              </div>
            </div>
            <div className="api-docs-inline-code">
              <span>HTTP-заголовок</span>
              <code>Authorization: Bearer sk_live_&lt;public_api_key&gt;</code>
            </div>
            <p className="api-docs-note">Ответы возвращаются в едином конверте: проверяйте <code>status</code>, а <code>traceId</code> приложите к обращению в поддержку.</p>
          </section>

          <section className="api-docs-section" id="web-sdk">
            <div className="api-docs-section-heading">
              <span className="api-docs-section-icon violet"><Braces size={19} /></span>
              <div>
                <p className="api-docs-kicker">02 · Виджет на сайте</p>
                <h2>Подключите Web SDK</h2>
                <p>Разместите собранный файл виджета на своём CDN и добавьте инициализацию на страницы, где должен появиться чат.</p>
              </div>
            </div>
            <CodeExample code={widgetExample} language="HTML" title="Подключение Web SDK" />
            <div className="api-docs-feature-grid">
              <article><Radio size={18} /><strong>Присутствие</strong><p>Виджет поддерживает сессию посетителя до первого сообщения.</p></article>
              <article><MessageSquare size={18} /><strong>Диалоги</strong><p>После первого сообщения создаётся диалог и включается получение ответов оператора.</p></article>
              <article><KeyRound size={18} /><strong>Идентификация</strong><p>Передавайте стабильный <code>externalId</code>, чтобы связать обращения клиента.</p></article>
            </div>
          </section>

          <section className="api-docs-section" id="messages">
            <div className="api-docs-section-heading">
              <span className="api-docs-section-icon teal"><MessageSquare size={19} /></span>
              <div>
                <p className="api-docs-kicker">03 · Клиенты и сообщения</p>
                <h2>Идентифицируйте клиента и отправьте сообщение</h2>
                <p>Вызов <code>/public/sdk/identify</code> связывает внешний идентификатор с клиентом. Сообщение создаёт диалог или продолжает существующий.</p>
              </div>
            </div>
            <div className="api-docs-example-stack">
              <div>
                <h3>Идентификация</h3>
                <CodeExample code={identifyExample} language="JavaScript" title="Идентификация клиента" />
              </div>
              <div>
                <h3>Новое сообщение</h3>
                <CodeExample code={messageExample} language="JavaScript" title="Отправка сообщения" />
              </div>
            </div>
          </section>

          <section className="api-docs-section" id="open-channel">
            <div className="api-docs-section-heading">
              <span className="api-docs-section-icon amber"><Webhook size={19} /></span>
              <div>
                <p className="api-docs-kicker">04 · Кастомный канал</p>
                <h2>Передавайте обращения из своего приложения</h2>
                <p>Open Channel принимает события из мобильного приложения, десктопного клиента или собственного интерфейса и ставит их в общую очередь.</p>
              </div>
            </div>
            <CodeExample code={openChannelExample} language="cURL" title="Входящее сообщение Open Channel" />
            <div className="api-docs-info-row">
              <div><strong>Приём событий</strong><code>POST /open-channel/:channelToken</code></div>
              <div><strong>Статус операторов</strong><code>GET /open-channel/:channelToken/status</code></div>
              <div><strong>Повторы</strong><span>Повторяйте сетевые ошибки и ответы 5xx до 3 раз.</span></div>
            </div>
          </section>

          <section className="api-docs-section" id="webhooks">
            <div className="api-docs-section-heading">
              <span className="api-docs-section-icon rose"><ShieldCheck size={19} /></span>
              <div>
                <p className="api-docs-kicker">05 · Защита событий</p>
                <h2>Проверяйте webhook-подписи</h2>
                <p>Для подписанных входящих событий проверяйте HMAC по исходному телу, ограничивайте возраст timestamp и сохраняйте nonce, чтобы отклонять повторы.</p>
              </div>
            </div>
            <CodeExample code={webhookExample} language="Node.js" title="Проверка webhook-подписи" />
            <div className="api-docs-checklist">
              <span><Check size={16} /> Считайте подпись до разбора JSON.</span>
              <span><Check size={16} /> Используйте сравнение в постоянное время.</span>
              <span><Check size={16} /> Не обрабатывайте повторный <code>x-webhook-nonce</code>.</span>
            </div>
          </section>

          <section className="api-docs-next">
            <div>
              <span className="api-docs-eyebrow"><BookOpen size={15} /> Нужна полная схема?</span>
              <h2>Откройте интерактивную спецификацию</h2>
              <p>В OpenAPI доступны параметры методов, модели ответов и все публичные маршруты текущей версии.</p>
            </div>
            <a className="api-docs-primary-button light" href="/api/docs" rel="noreferrer" target="_blank">
              Открыть OpenAPI
              <ExternalLink size={17} />
            </a>
          </section>
        </div>
      </div>
    </main>
  );
}

export default ApiDocsPage;
