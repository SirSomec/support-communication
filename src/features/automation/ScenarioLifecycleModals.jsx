import React, { useState } from "react";
import { AlertTriangle, CheckCircle2, PauseCircle, Trash2 } from "lucide-react";
import { Modal, StatusBadge } from "../../ui.jsx";
import { SCENARIO_ARCHIVE_RETENTION_DAYS, buildPublishChecklist } from "./automationModel.js";

export function ScenarioArchiveConfirmModal({ isSaving, onClose, onConfirm, scenario }) {
  const [typedName, setTypedName] = useState("");
  const matches = typedName.trim() === String(scenario?.name ?? "").trim();

  return (
    <Modal
      closeLabel="Отменить удаление сценария"
      eyebrow="Undo-safe удаление"
      footer={
        <>
          <button disabled={isSaving} onClick={onClose} type="button">Отмена</button>
          <button className="scenario-delete-button" disabled={!matches || isSaving} onClick={() => onConfirm?.(scenario)} type="button">
            <Trash2 size={15} /> {isSaving ? "Удаляем..." : "Удалить в архив"}
          </button>
        </>
      }
      onClose={onClose}
      title={`Удалить «${scenario?.name ?? ""}»?`}
      titleId="scenario-archive-title"
    >
      <div className="scenario-lifecycle-modal">
        <p>Сценарий исчезнет из активных, но его можно будет восстановить. После восстановления он останется выключенным, пока вы снова не опубликуете его.</p>
        <p className="scenario-lifecycle-note">Срок хранения архива: {SCENARIO_ARCHIVE_RETENTION_DAYS} дней.</p>
        <label className="scenario-wizard-field">
          <span>Введите название сценария для подтверждения</span>
          <input
            aria-invalid={!matches && typedName.length > 0}
            autoFocus
            onChange={(event) => setTypedName(event.target.value)}
            placeholder={scenario?.name}
            value={typedName}
          />
          {!matches && typedName.length > 0 ? (
            <small className="scenario-field-error" role="alert">Название не совпадает — удаление недоступно.</small>
          ) : null}
        </label>
      </div>
    </Modal>
  );
}

export function ScenarioPublishChecklistModal({
  aiReadiness,
  isSaving,
  knowledgeSources,
  onClose,
  onConfirm,
  sandboxVerified,
  scenario
}) {
  const checklist = buildPublishChecklist(scenario, { aiReadiness, knowledgeSources, sandboxVerified });

  return (
    <Modal
      closeLabel="Закрыть checklist публикации"
      eyebrow="Перед публикацией"
      footer={
        <>
          <button disabled={isSaving} onClick={onClose} type="button">Отмена</button>
          <button className="primary-action" disabled={!checklist.canPublish || isSaving} onClick={() => onConfirm?.(scenario)} type="button">
            <CheckCircle2 size={16} /> {isSaving ? "Публикуем..." : "Опубликовать"}
          </button>
        </>
      }
      onClose={onClose}
      title={`Публикация «${scenario?.name ?? ""}»`}
      titleId="scenario-publish-checklist-title"
    >
      <div className="scenario-lifecycle-modal">
        <p>Клиенты начнут получать этот сценарий только после успешной публикации. Проверьте список ниже.</p>
        <ul className="scenario-publish-checklist">
          {checklist.items.map((item) => (
            <li className={item.ok ? "ok" : item.blocking ? "fail" : "warn"} key={item.id}>
              {item.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
              <span>{item.label}</span>
              <StatusBadge tone={item.ok ? "ok" : item.blocking ? "warn" : "info"}>
                {item.ok ? "готово" : item.blocking ? "нужно исправить" : "рекомендация"}
              </StatusBadge>
            </li>
          ))}
        </ul>
        <p className="scenario-lifecycle-note">{checklist.retentionNote}</p>
        {!checklist.canPublish ? (
          <p className="scenario-field-error" role="alert">Исправьте обязательные пункты, затем повторите публикацию.</p>
        ) : null}
      </div>
    </Modal>
  );
}

export function ScenarioPauseConfirmModal({ isSaving, onClose, onConfirm, scenario }) {
  return (
    <Modal
      closeLabel="Отменить остановку сценария"
      eyebrow="Пауза / выключение"
      footer={
        <>
          <button disabled={isSaving} onClick={onClose} type="button">Отмена</button>
          <button className="primary-action" disabled={isSaving} onClick={() => onConfirm?.(scenario)} type="button">
            <PauseCircle size={16} /> {isSaving ? "Останавливаем..." : "Остановить сценарий"}
          </button>
        </>
      }
      onClose={onClose}
      title={`Остановить «${scenario?.name ?? ""}»?`}
      titleId="scenario-pause-title"
    >
      <div className="scenario-lifecycle-modal">
        <p>Новые диалоги больше не будут запускать этот сценарий. Уже начатые разговоры продолжат работу на закреплённой версии.</p>
        <p className="scenario-lifecycle-note">Чтобы снова включить сценарий, опубликуйте его после проверки.</p>
      </div>
    </Modal>
  );
}
