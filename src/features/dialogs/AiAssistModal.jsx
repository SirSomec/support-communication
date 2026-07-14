import React from "react";
import { AlertTriangle, BookOpenCheck, CheckCircle2, RefreshCw, Sparkles } from "lucide-react";
import { Modal } from "../../ui.jsx";
import "./dialog-modals.css";

// Модалка «ИИ-подсказка»: показывает до трёх вариантов ответа по знаниям.
// Выбор только предзаполняет композер — отправка остаётся ручным действием оператора.
export function AiAssistModal({ citations = [], error, knowledgeUsed, loading, onClose, onPick, onRetry, suggestions = [] }) {
  const sourceTitles = [...new Set(citations.map((citation) => citation.title).filter(Boolean))];

  return (
    <Modal
      eyebrow="AI copilot"
      footer={
        <>
          <button onClick={onClose} type="button">Отказаться</button>
          {error ? (
            <button className="primary-action" onClick={onRetry} type="button">
              <RefreshCw size={16} />
              Повторить
            </button>
          ) : null}
        </>
      }
      onClose={onClose}
      overlayClassName="ai-assist-overlay"
      panelClassName="ai-assist-panel"
      title="ИИ-подсказка"
      titleId="ai-assist-title"
    >
      {loading ? (
        <div aria-busy="true" className="ai-assist-loading" role="status">
          <Sparkles size={18} />
          <span>Анализируем диалог и базу знаний...</span>
        </div>
      ) : error ? (
        <div className="ai-assist-error" role="alert">
          <AlertTriangle size={16} />
          {error}
        </div>
      ) : (
        <div className="ai-assist-body">
          <p className="ai-assist-hint">
            Выберите вариант — он попадёт в поле ввода, и его можно будет отредактировать перед отправкой.
          </p>
          <div className="ai-assist-options" aria-label="Варианты ответа">
            {suggestions.map((suggestion) => (
              <article className="ai-assist-option" key={suggestion.id}>
                <strong>{suggestion.label}</strong>
                <p>{suggestion.text}</p>
                <button onClick={() => onPick(suggestion)} type="button">
                  <CheckCircle2 size={15} />
                  Выбрать
                </button>
              </article>
            ))}
          </div>
          {knowledgeUsed && sourceTitles.length ? (
            <p className="ai-assist-sources">
              <BookOpenCheck size={14} />
              На основе знаний: {sourceTitles.join(", ")}
            </p>
          ) : (
            <p className="ai-assist-sources warn">
              <AlertTriangle size={14} />
              Совпадений в базе знаний не найдено — проверьте факты перед отправкой.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
