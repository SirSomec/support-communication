import React from "react";
import { Info } from "lucide-react";
import { Modal } from "../../ui.jsx";

// Единый заголовок раздела настроек: название, подсказка для пользователя
// и действия (кнопки, открывающие модальные окна).
export function SettingsSectionHeader({ title, hint, meta, actions }) {
  return (
    <header className="settings-section-header">
      <div className="settings-section-heading">
        <h2>{title}</h2>
        {meta ? <span className="settings-section-meta">{meta}</span> : null}
        {hint ? <p>{hint}</p> : null}
      </div>
      {actions ? <div className="settings-section-actions">{actions}</div> : null}
    </header>
  );
}

// Подсказка под полем формы.
export function FieldHint({ children }) {
  return <small className="settings-field-hint">{children}</small>;
}

// Информационная строка-подсказка внутри раздела или модального окна.
export function InlineHint({ children }) {
  return (
    <div className="settings-inline-hint">
      <Info size={15} />
      <span>{children}</span>
    </div>
  );
}

// Модальное окно настроек поверх общего Modal с фиксированной шапкой,
// прокручиваемым телом и футером с действиями.
export function SettingsModal({ children, eyebrow = "Настройки", footer, onClose, size = "", title, titleId }) {
  return (
    <Modal
      eyebrow={eyebrow}
      footer={footer}
      onClose={onClose}
      overlayClassName="settings-modal-overlay"
      panelClassName={["settings-modal-panel", size].filter(Boolean).join(" ")}
      title={title}
      titleId={titleId}
    >
      <div className="settings-modal-body">{children}</div>
    </Modal>
  );
}
