import React, { useState } from "react";
import { BookOpen, PhoneCall, Send, Smartphone } from "lucide-react";
import { topicOptions } from "../../data.js";
import { Modal } from "../../ui.jsx";
import "./dialog-modals.css";

export function OutboundDialogLauncher({ conversations, onClose, onCreate, onToast }) {
  const [phone, setPhone] = useState("+7 ");
  const [clientName, setClientName] = useState("");
  const [channel, setChannel] = useState("SDK");
  const [topic, setTopic] = useState(topicOptions[0]);
  const [message, setMessage] = useState("Здравствуйте! Пишем по вашему обращению, готовы помочь в этом диалоге.");

  const normalizedPhone = phone.replace(/\D/g, "");
  const existing = conversations.find((conversation) => conversation.phone.replace(/\D/g, "") === normalizedPhone);
  const device = channel === "SDK" ? "Android / iOS из SDK" : "Определится каналом";
  const canCreate = normalizedPhone.length >= 11 && message.trim().length > 0;

  function handleCreate() {
    if (!canCreate) {
      onToast("Укажите телефон и стартовое сообщение для исходящего диалога.");
      return;
    }

    onCreate({
      phone,
      clientName: existing?.name ?? clientName.trim(),
      channel,
      topic,
      message: message.trim(),
      device,
      existing
    });
  }

  return (
    <Modal
      eyebrow="SDK contact center"
      footer={
        <>
          <button onClick={onClose} type="button">Отмена</button>
          <button className="primary-action" disabled={!canCreate} onClick={handleCreate} type="button">
            <Send size={17} />
            Создать диалог
          </button>
        </>
      }
      onClose={onClose}
      overlayClassName="outbound-overlay"
      panelClassName="outbound-panel"
      title="Новый исходящий диалог"
      titleId="outbound-dialog-title"
    >
      <div className="outbound-grid">
        <label>
          <span>Телефон клиента</span>
          <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+7 999 000-00-00" />
        </label>
        <label>
          <span>Имя, если новый клиент</span>
          <input value={clientName} onChange={(event) => setClientName(event.target.value)} placeholder="Новый клиент" disabled={Boolean(existing)} />
        </label>
        <label>
          <span>Канал запуска</span>
          <select value={channel} onChange={(event) => setChannel(event.target.value)}>
            {["SDK", "Telegram", "MAX", "VK"].map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label>
          <span>Тематика</span>
          <select value={topic} onChange={(event) => setTopic(event.target.value)}>
            {topicOptions.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
      </div>

      <label className="outbound-message">
        <span>Стартовое сообщение</span>
        <textarea value={message} onChange={(event) => setMessage(event.target.value)} />
      </label>

      <div className="sdk-preview">
        <div>
          <PhoneCall size={18} />
          <strong>{existing ? `Найден профиль: ${existing.name}` : "Будет создан новый профиль"}</strong>
          <span>{phone} · {channel} · {device}</span>
        </div>
        <div>
          <Smartphone size={18} />
          <strong>SDK-событие</strong>
          <span>initConversation(phone, channel, topic, operatorId)</span>
        </div>
      </div>
    </Modal>
  );
}

export function SaveTemplateDialog({ draft, onClose, onSave }) {
  const [form, setForm] = useState(draft);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handleSave() {
    onSave({
      ...form,
      title: form.title.trim() || "Новый шаблон",
      text: form.text.trim()
    });
  }

  return (
    <Modal
      eyebrow="Личная база оператора"
      footer={
        <>
          <button onClick={onClose} type="button">Отмена</button>
          <button className="primary-action" disabled={!form.text.trim()} onClick={handleSave} type="button">
            <BookOpen size={17} />
            Сохранить шаблон
          </button>
        </>
      }
      onClose={onClose}
      overlayClassName="template-save-overlay"
      panelClassName="template-save-panel"
      title="Сохранить как шаблон"
      titleId="save-template-title"
    >
      <div className="template-save-grid">
        <label>
          <span>Название</span>
          <input value={form.title} onChange={(event) => update("title", event.target.value)} />
        </label>
        <label>
          <span>Доступ</span>
          <select value={form.scope} onChange={(event) => update("scope", event.target.value)}>
            {["Личный", "Командный", "Глобальный"].map((option) => <option key={option}>{option}</option>)}
          </select>
        </label>
        <label>
          <span>Канал</span>
          <select value={form.channel} onChange={(event) => update("channel", event.target.value)}>
            {["Все", "SDK", "Telegram", "MAX", "VK"].map((option) => <option key={option}>{option}</option>)}
          </select>
        </label>
        <label>
          <span>Тематика</span>
          <input value={form.topic} onChange={(event) => update("topic", event.target.value)} />
        </label>
      </div>

      <label className="template-save-text">
        <span>Текст шаблона</span>
        <textarea value={form.text} onChange={(event) => update("text", event.target.value)} />
      </label>

      <div className="variable-row compact">
        {["{client_name}", "{operator_name}", "{ticket_id}", "{topic}"].map((variable) => (
          <button key={variable} onClick={() => update("text", `${form.text} ${variable}`.trim())} type="button">{variable}</button>
        ))}
      </div>
    </Modal>
  );
}

export function DraftSwitchDialog({ attachments, currentConversation, draft, onCancel, onConfirm, targetConversation }) {
  const draftPreview = draft.trim() ? draft.trim().slice(0, 120) : "Текст не набран";

  return (
    <Modal
      eyebrow="Несохраненный черновик"
      footer={
        <>
          <button onClick={onCancel} type="button">Остаться</button>
          <button className="danger-action" onClick={onConfirm} type="button">
            Сбросить и перейти
          </button>
        </>
      }
      onClose={onCancel}
      overlayClassName="draft-switch-overlay"
      panelClassName="draft-switch-panel"
      title="Перейти в другой диалог?"
      titleId="draft-switch-title"
    >
      <div className="draft-switch-body">
        <p>
          Сейчас открыт диалог с <strong>{currentConversation.name}</strong>. При переходе к <strong>{targetConversation.name}</strong> текущий черновик и очередь вложений будут очищены.
        </p>
        <div className="draft-switch-summary">
          <span>
            <strong>Черновик</strong>
            {draftPreview}
          </span>
          <span>
            <strong>Вложения</strong>
            {attachments.length ? `${attachments.length} в очереди` : "Нет вложений"}
          </span>
        </div>
      </div>
    </Modal>
  );
}
