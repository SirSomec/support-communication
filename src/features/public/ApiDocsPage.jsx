import React from "react";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Braces,
  Check,
  ChevronRight,
  Code2,
  Copy,
  ExternalLink,
  FileUp,
  KeyRound,
  Layers3,
  MessageSquare,
  Radio,
  ShieldCheck,
  Star,
  Webhook
} from "lucide-react";
import "./api-docs.css";

const navigationItems = [
  { id: "overview", label: "Обзор" },
  { id: "authentication", label: "Авторизация" },
  { id: "web-sdk", label: "Web SDK" },
  { id: "messages", label: "Сообщения" },
  { id: "runtime", label: "Сессии и файлы" },
  { id: "open-channel", label: "Open Channel" },
  { id: "webhooks", label: "Webhooks" },
  { id: "errors", label: "Ошибки и повторы" }
];

const sdkEndpointGroups = [
  {
    title: "Клиент и диалог",
    endpoints: [
      ["POST", "/public/sdk/identify", "Связать externalId с клиентом"],
      ["POST", "/public/sdk/messages", "Отправить текст или вложения"],
      ["GET", "/public/sdk/conversations/:id/messages", "Получить ответы и CSAT-состояние"],
      ["POST", "/public/sdk/client-info", "Обновить контакты и custom data"],
      ["GET", "/public/sdk/agents/status", "Проверить доступность операторов"]
    ]
  },
  {
    title: "Сессия виджета",
    endpoints: [
      ["POST", "/public/sdk/presence/heartbeat", "Продлить присутствие посетителя"],
      ["POST", "/public/sdk/presence/disconnect", "Завершить присутствие"],
      ["GET", "/public/sdk/invitations", "Получить проактивные приглашения"],
      ["POST", "/public/sdk/invitations/:exposureId/:action", "Зафиксировать показ, принятие или отказ"]
    ]
  },
  {
    title: "Файлы и качество",
    endpoints: [
      ["POST", "/public/sdk/uploads", "Получить одноразовый upload descriptor"],
      ["POST", "/public/sdk/uploads/:fileId/finalize", "Подтвердить загрузку"],
      ["POST", "/public/sdk/conversations/:id/ratings", "Передать CSAT/CSI 1–5"],
      ["POST", "/public/sdk/conversations/:id/csat-feedback/decline", "Пропустить комментарий и открыть новое обращение"]
    ]
  }
];

const widgetExample = `<script defer src="https://supportcom.ru/widget.js"></script>
<script>
  SupportWidget.init({
    apiBase: "https://supportcom.ru/api/v1",
    publicKey: "sk_live_<public_api_key>",
    externalId: "customer_42",
    environment: "production"
  });
</script>`;

const identifyExample = `const apiBase = "https://supportcom.ru/api/v1";
const headers = {
  authorization: "Bearer sk_live_<public_api_key>",
  "content-type": "application/json"
};

const response = await fetch(
  \`\${apiBase}/public/sdk/identify?environment=production\`,
  {
    method: "POST",
    headers,
    body: JSON.stringify({
      externalId: "customer_42",
      traits: { plan: "business", locale: "ru-RU" }
    })
  }
);

const result = await response.json();
if (result.status !== "ok") throw new Error(result.error?.message);`;

const messageExample = `const response = await fetch(
  "https://supportcom.ru/api/v1/public/sdk/messages?environment=production",
  {
    method: "POST",
    headers,
    body: JSON.stringify({
      externalId: "customer_42",
      pageUrl: window.location.href,
      text: "Подскажите статус заказа №1024"
    })
  }
);

const { status, data, error, traceId } = await response.json();
if (status !== "ok") throw new Error(
  \`\${error?.code}: \${error?.message}; traceId=\${traceId}\`
);

// Сохраните оба значения: токен обновляется при каждом polling-запросе.
const { conversationId, visitorSessionToken } = data;`;

const pollExample = `const query = new URLSearchParams({
  environment: "production",
  visitorSessionToken,
  ...(lastMessageId ? { since: lastMessageId } : {})
});

const response = await fetch(
  \`\${apiBase}/public/sdk/conversations/\${conversationId}/messages?\${query}\`,
  { headers: { authorization: "Bearer sk_live_<public_api_key>" } }
);

const result = await response.json();
// result.data.messages — только новые ответы оператора
// result.data.visitorSessionToken — обновлённый токен на следующие 15 минут
// result.data.csatSurvey — состояние оценки после закрытия диалога`;

const uploadExample = `// 1. Получите одноразовый URL загрузки.
const descriptor = await sdkRequest("POST", "/public/sdk/uploads", {
  fileName: file.name,
  mimeType: file.type,
  sizeBytes: file.size
});

// 2. Загрузите файл по descriptor.data.signedUpload.url
//    с методом и заголовками из descriptor.

// 3. Подтвердите загрузку, затем передайте файл в сообщении.
await sdkRequest("POST", \`/public/sdk/uploads/\${descriptor.data.fileId}/finalize\`, {});
await sdkRequest("POST", "/public/sdk/messages", {
  externalId: "customer_42",
  text: "Прикладываю документ",
  attachments: [{
    fileId: descriptor.data.fileId,
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size
  }]
});`;

const openChannelExample = `curl -X POST "https://supportcom.ru/api/v1/open-channel/<channel_token>" \\
  -H "Content-Type: application/json; charset=utf-8" \\
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

function verifySignedDelivery(rawBody, headers, secret) {
  const timestamp = headers["x-webhook-timestamp"];
  const actual = headers["x-webhook-signature"];
  const expected = \`sha256=\${createHmac("sha256", secret)
    .update(\`\${timestamp}.\${rawBody}\`)
    .digest("hex")}\`;

  if (!actual || Buffer.byteLength(actual) !== Buffer.byteLength(expected)) {
    return false;
  }
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

// Ограничьте возраст timestamp и дедуплицируйте idempotency-key
// (либо x-webhook-delivery-id) до выполнения бизнес-логики.`;

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
        if (!copiedToClipboard) throw new Error("Clipboard copy is unavailable");
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

function EndpointGroups() {
  return (
    <div className="api-docs-endpoint-groups">
      {sdkEndpointGroups.map((group) => (
        <section key={group.title}>
          <h3>{group.title}</h3>
          <div>
            {group.endpoints.map(([method, path, description]) => (
              <article key={`${method}-${path}`}>
                <span className={`api-docs-method ${method.toLowerCase()}`}>{method}</span>
                <code>{path}</code>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
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
        <a className="api-docs-brand" href="/">
          <span>SC</span>
          <strong>Support Communication</strong>
        </a>
        <div className="api-docs-header-actions">
          <a className="api-docs-openapi-link" href="/api/docs" rel="noreferrer" target="_blank">
            OpenAPI
            <ExternalLink size={15} />
          </a>
          <a className="api-docs-back-link" href="/">
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
            <span>Интерактивные схемы</span>
            <ExternalLink size={14} />
          </a>
        </aside>

        <div className="api-docs-content">
          <section className="api-docs-hero" id="overview">
            <span className="api-docs-eyebrow"><Code2 size={15} /> Документация для разработчиков</span>
            <h1>Интеграции с Support Communication</h1>
            <p>
              Подключите готовый Web SDK, используйте публичный JSON API или передавайте обращения через Open Channel.
              Ниже описан полный рабочий цикл: ключи и среды, сообщения, файлы, ответы операторов, CSAT и webhook-доставка.
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
              <code>https://supportcom.ru/api/v1</code>
            </div>
            <div className="api-docs-feature-grid api-docs-overview-grid">
              <article><Braces size={18} /><strong>Web SDK</strong><p>Готовый виджет, page API <code>window.sw_api</code> и глобальные callbacks.</p></article>
              <article><MessageSquare size={18} /><strong>Public SDK API</strong><p>Клиенты, сообщения, polling ответов, вложения и оценки.</p></article>
              <article><Webhook size={18} /><strong>Open Channel</strong><p>Двунаправленный протокол для собственных приложений и каналов.</p></article>
            </div>
          </section>

          <section className="api-docs-section" id="authentication">
            <div className="api-docs-section-heading">
              <span className="api-docs-section-icon blue"><KeyRound size={19} /></span>
              <div>
                <p className="api-docs-kicker">01 · Начало работы</p>
                <h2>Ключ, среда, scopes и envelope</h2>
                <p>Создайте публичный ключ для SDK-подключения, сохраните его сразу и передавайте в Bearer-заголовке. Open Channel использует отдельный токен в URL.</p>
              </div>
            </div>
            <div className="api-docs-two-column">
              <div className="api-docs-prose-card">
                <h3>Три шага до первого запроса</h3>
                <ol className="api-docs-steps">
                  <li><span>1</span><p>Создайте SDK-подключение и ключ в настройках интеграций. Секрет показывается полностью один раз.</p></li>
                  <li><span>2</span><p>Для тестов используйте <code>environment=stage</code> и ключ <code>sk_test_…</code>; для боевого трафика — <code>production</code> и <code>sk_live_…</code>.</p></li>
                  <li><span>3</span><p>Не передавайте <code>environment</code> внутри <code>traits</code>: среда определяется query-параметром и должна совпасть с ключом.</p></li>
                </ol>
              </div>
              <div className="api-docs-callout">
                <ShieldCheck size={21} />
                <div>
                  <strong>Публичный ключ — не токен оператора</strong>
                  <p>В браузер разрешено передавать только ключ SDK с минимальными scopes. Не публикуйте operator/service-admin токены и не сохраняйте реальные секреты в логах.</p>
                </div>
              </div>
            </div>
            <div className="api-docs-inline-code">
              <span>HTTP-заголовок</span>
              <code>Authorization: Bearer sk_live_&lt;public_api_key&gt;</code>
            </div>
            <div className="api-docs-info-row">
              <div><strong><code>clients:identify</code></strong><span>Идентификация, presence и проактивные приглашения.</span></div>
              <div><strong><code>conversations:write</code></strong><span>Сообщения, polling, файлы, карточка клиента и оценки.</span></div>
              <div><strong>Envelope</strong><span>HTTP 200 не гарантирует успех: проверяйте <code>status</code>, <code>error.code</code> и <code>traceId</code>.</span></div>
            </div>
          </section>

          <section className="api-docs-section" id="web-sdk">
            <div className="api-docs-section-heading">
              <span className="api-docs-section-icon violet"><Braces size={19} /></span>
              <div>
                <p className="api-docs-kicker">02 · Виджет на сайте</p>
                <h2>Подключите Web SDK</h2>
                <p>Добавьте опубликованный <code>widget.js</code> и инициализируйте виджет на страницах чата. Стабильный <code>externalId</code> связывает обращения одного клиента.</p>
              </div>
            </div>
            <CodeExample code={widgetExample} language="HTML" title="Подключение Web SDK" />
            <div className="api-docs-feature-grid">
              <article><Radio size={18} /><strong>Presence и приглашения</strong><p>Виджет поддерживает живую сессию и получает проактивные приглашения до первого сообщения.</p></article>
              <article><Layers3 size={18} /><strong>Page API</strong><p><code>window.sw_api</code> управляет окном, контактами, custom data, UTM и счётчиком непрочитанных.</p></article>
              <article><Star size={18} /><strong>CSAT</strong><p>После закрытия диалога виджет показывает оценку 1–5 и необязательный комментарий.</p></article>
            </div>
            <p className="api-docs-note">
              Основные методы page API: <code>open</code>, <code>close</code>, <code>chatMode</code>, <code>setContactInfo</code>, <code>setCustomData</code>, <code>setClientAttributes</code>, <code>setUserToken</code>, <code>sendOfflineMessage</code> и <code>clearHistory</code>.
            </p>
          </section>

          <section className="api-docs-section" id="messages">
            <div className="api-docs-section-heading">
              <span className="api-docs-section-icon teal"><MessageSquare size={19} /></span>
              <div>
                <p className="api-docs-kicker">03 · Клиенты и сообщения</p>
                <h2>Идентифицируйте, отправьте и получите ответ</h2>
                <p><code>identify</code> создаёт или находит диалог, <code>messages</code> принимает обращение, а polling возвращает только новые ответы оператора и обновляет visitor token.</p>
              </div>
            </div>
            <div className="api-docs-example-stack">
              <div><h3>1. Идентификация</h3><CodeExample code={identifyExample} language="JavaScript" title="Идентификация клиента" /></div>
              <div><h3>2. Новое сообщение</h3><CodeExample code={messageExample} language="JavaScript" title="Отправка сообщения" /></div>
              <div><h3>3. Polling ответов</h3><CodeExample code={pollExample} language="JavaScript" title="Получение ответов оператора" /></div>
            </div>
            <div className="api-docs-checklist">
              <span><Check size={16} /> Храните <code>conversationId</code> вместе с клиентской сессией.</span>
              <span><Check size={16} /> Заменяйте visitor token значением из последнего ответа.</span>
              <span><Check size={16} /> Передавайте <code>since</code>, чтобы не получать уже показанные сообщения.</span>
            </div>
          </section>

          <section className="api-docs-section" id="runtime">
            <div className="api-docs-section-heading">
              <span className="api-docs-section-icon violet"><Activity size={19} /></span>
              <div>
                <p className="api-docs-kicker">04 · Полный цикл SDK</p>
                <h2>Сессии, файлы, карточка клиента и оценки</h2>
                <p>Публичный SDK включает не только отправку текста. Используйте presence для проактивных сценариев, двухшаговую загрузку файлов и защищённый visitor token для polling и CSAT.</p>
              </div>
            </div>
            <EndpointGroups />
            <div className="api-docs-example-stack api-docs-runtime-example">
              <div><h3><FileUp size={17} /> Загрузка вложения</h3><CodeExample code={uploadExample} language="JavaScript" title="Загрузка файла и отправка вложения" /></div>
            </div>
            <p className="api-docs-note">Перед отправкой дождитесь успешной финализации и проверки файла. Скачивание готовых вложений использует короткоживущие подписанные URL из polling-ответа.</p>
          </section>

          <section className="api-docs-section" id="open-channel">
            <div className="api-docs-section-heading">
              <span className="api-docs-section-icon amber"><Webhook size={19} /></span>
              <div>
                <p className="api-docs-kicker">05 · Кастомный канал</p>
                <h2>Передавайте обращения из своего приложения</h2>
                <p>Open Channel — симметричный протокол <code>{`{ sender, recipient, message }`}</code> для мобильных приложений, десктопных клиентов и собственных интерфейсов.</p>
              </div>
            </div>
            <CodeExample code={openChannelExample} language="cURL" title="Входящее сообщение Open Channel" />
            <div className="api-docs-info-row">
              <div><strong>Приём событий</strong><code>POST /open-channel/:channelToken</code></div>
              <div><strong>Активный диалог</strong><code>GET /open-channel/:channelToken/status → 0 | 1</code></div>
              <div><strong>Повторы</strong><span>Повторяйте сеть и 5xx до 3 раз; 4xx — постоянная ошибка.</span></div>
            </div>
            <p className="api-docs-note">Поддерживаются <code>text</code>, медиа, <code>location</code>, <code>rate</code>, <code>seen</code>, <code>keyboard</code>, <code>typein</code>, <code>start</code> и <code>stop</code>. Полные поля и примеры доступны в OpenAPI.</p>
          </section>

          <section className="api-docs-section" id="webhooks">
            <div className="api-docs-section-heading">
              <span className="api-docs-section-icon rose"><ShieldCheck size={19} /></span>
              <div>
                <p className="api-docs-kicker">06 · Исходящие события</p>
                <h2>Различайте Event Webhooks и signed deliveries</h2>
                <p>Это два отдельных контура. Подписки Open Channel доставляют события диалогов в JSON, а signed webhook endpoints добавляют HMAC-заголовки, когда для окружения настроен signing secret.</p>
              </div>
            </div>
            <div className="api-docs-two-column">
              <div className="api-docs-prose-card">
                <h3>Event Webhooks</h3>
                <p>События: <code>chat_accepted</code>, <code>chat_updated</code>, <code>chat_finished</code>, <code>client_updated</code>, <code>client_attribute_updated</code> и <code>offline_message</code>. Ответы 4xx не повторяются; сеть/5xx повторяются до 3 раз.</p>
              </div>
              <div className="api-docs-prose-card">
                <h3>Signed webhook endpoints</h3>
                <p>Подпись вычисляется по точным байтам <code>{`{timestamp}.{rawBody}`}</code>. Дедупликация строится по <code>idempotency-key</code> или <code>x-webhook-delivery-id</code>, а не по несуществующему nonce.</p>
              </div>
            </div>
            <div className="api-docs-runtime-example">
              <CodeExample code={webhookExample} language="Node.js" title="Проверка подписи исходящей webhook-доставки" />
            </div>
            <div className="api-docs-checklist">
              <span><Check size={16} /> Считайте подпись до разбора JSON.</span>
              <span><Check size={16} /> Проверяйте длину до <code>timingSafeEqual</code>.</span>
              <span><Check size={16} /> Дедуплицируйте delivery id до бизнес-логики.</span>
            </div>
          </section>

          <section className="api-docs-section" id="errors">
            <div className="api-docs-section-heading">
              <span className="api-docs-section-icon amber"><AlertTriangle size={19} /></span>
              <div>
                <p className="api-docs-kicker">07 · Надёжная интеграция</p>
                <h2>Ошибки, безопасность и повторы</h2>
                <p>SDK сообщает бизнес-результат в поле <code>status</code>. Open Channel и webhook-доставка дополнительно используют HTTP-коды для решения о повторе.</p>
              </div>
            </div>
            <div className="api-docs-info-row">
              <div><strong><code>invalid</code></strong><span>Исправьте тело или параметры; автоматический повтор не поможет.</span></div>
              <div><strong><code>denied / unauthorized</code></strong><span>Проверьте ключ, среду, scope и принадлежность диалога.</span></div>
              <div><strong><code>conflict / rate_limited</code></strong><span>Соблюдайте idempotency и повторяйте только после указанного окна.</span></div>
            </div>
            <div className="api-docs-callout api-docs-warning-callout">
              <AlertTriangle size={21} />
              <div>
                <strong>Не делайте слепые повторы</strong>
                <p>Для сетевых ошибок и 5xx используйте ограниченный exponential backoff. Для mutation-запросов задавайте стабильный idempotency key там, где он предусмотрен, и логируйте только <code>error.code</code> с <code>traceId</code> — без секретов и visitor token.</p>
              </div>
            </div>
          </section>

          <section className="api-docs-next">
            <div>
              <span className="api-docs-eyebrow"><BookOpen size={15} /> Нужны точные схемы?</span>
              <h2>Откройте интерактивную спецификацию</h2>
              <p>В OpenAPI доступны request body, query/path-параметры, модели envelope и актуальные публичные маршруты текущей версии.</p>
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
