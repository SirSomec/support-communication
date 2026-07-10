import React from "react";
import { AlertTriangle, Copy, FileText, Lock, Plus, ShieldCheck, Smartphone } from "lucide-react";
import { maskPhone } from "../../app/dialogModel.js";

export function CustomerPanel({ conversation, topic, topicOptions = [], onTopic, setDraft, templates, onClose, access, isClosed }) {
  const channelTemplates = templates.filter((template) => sameValue(template.channel, conversation.channel));
  const recommendedTemplates = channelTemplates.length ? channelTemplates : templates;

  return (
    <aside className="customer-panel" aria-label="Карточка клиента">
      <PanelSection title="О клиенте" action={<button aria-label="Копировать"><Copy size={18} /></button>}>
        <InfoRow label="Телефон" value={access.canViewSensitive ? conversation.phone : maskPhone(conversation.phone)} />
        <InfoRow label="Устройство" value={conversation.device} icon={<Smartphone size={15} />} />
        <InfoRow label="Точка входа" value={conversation.entry} />
        <InfoRow label="Клиент с" value={conversation.clientSince} />
        <InfoRow label="Язык" value={conversation.language} />
        <div className="channel-list">
          <span>Канал(ы)</span>
          <div>
            {["SDK", "Telegram", "MAX", "VK"].map((channel) => (
              <span className={`channel-chip ${channel.toLowerCase()}`} key={channel}>{channel}</span>
            ))}
          </div>
        </div>
      </PanelSection>

      <PanelSection title="Предыдущие диалоги" action={<button>Смотреть все</button>}>
        <div className="history-list">
          {(conversation.previous.length ? conversation.previous : [["-", "Истории пока нет", "Новый"]]).map(([date, title, status]) => (
            <div className="history-row" key={`${date}${title}`}>
              <time>{date}</time>
              <span>{title}</span>
              <b>{status}</b>
            </div>
          ))}
        </div>
      </PanelSection>

      <PanelSection title="Теги" action={<button><Plus size={16} /> Добавить тег</button>}>
        <div className="tag-list">
          {conversation.tags.map((tag) => (
            <span key={tag}>{tag}<button aria-label={`Удалить тег ${tag}`}>×</button></span>
          ))}
        </div>
      </PanelSection>

      <PanelSection title="Рекомендуемые шаблоны">
        <div className="template-list">
          {recommendedTemplates.slice(0, 3).map((template) => (
            <button key={template.id} onClick={() => setDraft(template.text)}>
              <span>
                <strong>{template.title}</strong>
                <small>{template.scope} · {template.channel}</small>
              </span>
              <b>Вставить</b>
            </button>
          ))}
        </div>
      </PanelSection>

      <PanelSection title="Рекомендуемые статьи">
        <div className="article-list">
          {["Отслеживание заказа", "Сроки и условия доставки"].map((title) => (
            <button key={title}>
              <span>
                <strong>{title}</strong>
                <small>{title === "Отслеживание заказа" ? "Инструкция" : "Статья"}</small>
              </span>
              <FileText size={17} />
            </button>
          ))}
        </div>
      </PanelSection>

      <PanelSection title="Закрытие диалога">
        <label className="close-topic">
          <span>Тематика</span>
          <select value={topic} onChange={(event) => onTopic(event.target.value)} disabled={isClosed}>
            <option value="">Не выбрана</option>
            {topicOptions.map((option) => (
              <option value={option} key={option}>{option}</option>
            ))}
          </select>
        </label>
        <button className="close-button" onClick={onClose} disabled={isClosed || !topic}>
          {isClosed ? <ShieldCheck size={17} /> : <Lock size={17} />}
          {isClosed ? "Закрыт" : "Закрыть"}
        </button>
        {!topic ? (
          <p className="close-warning">
            <AlertTriangle size={16} />
            Для закрытия укажите тематику
          </p>
        ) : null}
      </PanelSection>
    </aside>
  );
}

function sameValue(left, right) {
  return String(left ?? "").trim().toLowerCase() === String(right ?? "").trim().toLowerCase();
}

function PanelSection({ title, action, children }) {
  return (
    <section className="panel-section">
      <header>
        <h2>{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

function InfoRow({ label, value, icon }) {
  return (
    <div className="info-row">
      <span>{label}</span>
      <strong>{value}</strong>
      {icon}
    </div>
  );
}
