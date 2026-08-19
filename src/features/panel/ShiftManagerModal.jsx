import React, { useState } from "react";
import { CalendarClock, UsersRound } from "lucide-react";
import { presenceStatusLabel } from "../../app/presenceModel.js";
import { shiftService } from "../../services/shiftService.js";
import { Modal } from "../../ui.jsx";
import { createShiftDraft, dateTimeLocalToIso } from "./panelModel.js";

export function ShiftManagerModal({ onClose, onSaved, onToast, operators, shift }) {
  const [draft, setDraft] = useState(() => createShiftDraft(shift));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const selectableOperators = Array.isArray(operators) ? operators : [];

  function toggleOperator(operatorId) {
    setDraft((current) => ({
      ...current,
      operatorIds: current.operatorIds.includes(operatorId)
        ? current.operatorIds.filter((id) => id !== operatorId)
        : [...current.operatorIds, operatorId]
    }));
  }

  async function saveShift() {
    const name = draft.name.trim();
    const startsAt = dateTimeLocalToIso(draft.startsAt);
    const endsAt = dateTimeLocalToIso(draft.endsAt);
    if (!name) {
      setError("Укажите название смены.");
      return;
    }
    if (!startsAt || !endsAt || Date.parse(endsAt) <= Date.parse(startsAt)) {
      setError("Конец смены должен быть позже её начала.");
      return;
    }
    if (!draft.operatorIds.length) {
      setError("Добавьте в смену хотя бы одного активного сотрудника.");
      return;
    }

    setSaving(true);
    setError("");
    const response = await shiftService.saveCurrent({ ...draft, endsAt, name, startsAt });
    setSaving(false);

    if (response.status !== "ok") {
      setError(response.error?.message ?? "Не удалось сохранить смену.");
      return;
    }

    onSaved?.(response.data?.shift ?? null);
    onToast?.("Состав текущей смены сохранён.");
    onClose();
  }

  return (
    <Modal
      closeLabel="Закрыть управление сменой"
      eyebrow="Состав и время"
      footer={
        <>
          <button onClick={onClose} type="button">Отмена</button>
          <button className="primary-action" disabled={saving} onClick={() => void saveShift()} type="button">
            {saving ? "Сохраняем…" : "Сохранить смену"}
          </button>
        </>
      }
      onClose={onClose}
      overlayClassName="shift-manager-overlay"
      panelClassName="shift-manager-panel"
      title="Управление текущей сменой"
      titleId="shift-manager-title"
    >
      <div className="shift-manager-body">
        <p className="shift-manager-intro">
          Смена — это явно заданный состав сотрудников и интервал работы. Только эти сотрудники учитываются в показателе «В смене».
        </p>
        <div className="shift-manager-fields">
          <label>
            <span>Название смены</span>
            <input
              aria-label="Название смены"
              maxLength={80}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              value={draft.name}
            />
          </label>
          <label>
            <CalendarClock aria-hidden="true" size={16} />
            <span>Начало</span>
            <input aria-label="Начало смены" onChange={(event) => setDraft((current) => ({ ...current, startsAt: event.target.value }))} type="datetime-local" value={draft.startsAt} />
          </label>
          <label>
            <CalendarClock aria-hidden="true" size={16} />
            <span>Конец</span>
            <input aria-label="Конец смены" onChange={(event) => setDraft((current) => ({ ...current, endsAt: event.target.value }))} type="datetime-local" value={draft.endsAt} />
          </label>
        </div>
        <section className="shift-roster" aria-labelledby="shift-roster-title">
          <header>
            <div>
              <h3 id="shift-roster-title"><UsersRound aria-hidden="true" size={17} /> Состав смены</h3>
              <span>Выбрано: {draft.operatorIds.length}</span>
            </div>
          </header>
          {!selectableOperators.length ? (
            <p className="shift-roster-empty">Нет доступных сотрудников. Повторите обновление данных панели.</p>
          ) : (
            <div className="shift-roster-list">
              {selectableOperators.map((operator) => {
                const id = String(operator.operatorId ?? operator.id ?? "");
                const checked = draft.operatorIds.includes(id);
                return (
                  <label className="shift-roster-item" key={id}>
                    <input checked={checked} onChange={() => toggleOperator(id)} type="checkbox" />
                    <span>
                      <strong>{operator.name ?? id}</strong>
                      <small>{presenceStatusLabel(operator.status)}{operator.role ? ` · ${operator.role}` : ""}</small>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </section>
        {error ? <p className="shift-manager-error" role="alert">{error}</p> : null}
      </div>
    </Modal>
  );
}
