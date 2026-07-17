import React, { useEffect, useState } from "react";
import { AlertTriangle, Clock3, Lock, ShieldCheck } from "lucide-react";
import { formatRescueNextAction, formatRescueTimer, resolutionOutcomeLabels } from "../../app/dialogModel.js";

const transcriptModes = [
  ["all", "Все"],
  ["internal", "Комментарии"],
  ["events", "Audit"]
];

export function TranscriptToolbar({
  activeRescue,
  conversationId,
  isClosed,
  isRescueExpired,
  onCloseDialog,
  onTranscriptModeChange,
  rescueRemainingSeconds,
  topic,
  transcriptMode
}) {
  const [resolutionOutcome, setResolutionOutcome] = useState("resolved");

  useEffect(() => {
    setResolutionOutcome("resolved");
  }, [conversationId]);

  return (
    <>
      <div className="transcript-toolbar" aria-label="Фильтр истории чата">
        <div className="transcript-toolbar-left">
          <div className="transcript-filter-buttons" role="group" aria-label="Тип записей">
            {transcriptModes.map(([id, label]) => (
              <button
                aria-pressed={transcriptMode === id}
                className={transcriptMode === id ? "active" : ""}
                key={id}
                onClick={() => onTranscriptModeChange(id)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
          {activeRescue ? (
            <div className={`rescue-timer-chip ${isRescueExpired ? "expired" : rescueRemainingSeconds <= 60 ? "danger" : ""}`}>
              <Clock3 size={16} />
              <strong>{formatRescueTimer(rescueRemainingSeconds)}</strong>
              <span>{isRescueExpired ? "Время вышло" : activeRescue.reason}</span>
              <b>{formatRescueNextAction(activeRescue.nextAction)}</b>
            </div>
          ) : null}
        </div>
        <div className="transcript-toolbar-actions">
          {!isClosed ? (
            <select aria-label="Результат закрытия" disabled={!topic} value={resolutionOutcome} onChange={(event) => setResolutionOutcome(event.target.value)}>
              {Object.entries(resolutionOutcomeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          ) : null}
          <button className="compact-close-button" disabled={isClosed || !topic} onClick={() => onCloseDialog({ resolutionOutcome })} type="button">
            {isClosed ? <ShieldCheck size={16} /> : <Lock size={16} />}
            {isClosed ? "Закрыт" : "Закрыть"}
          </button>
        </div>
      </div>
      {!topic && !isClosed ? (
        <div className="inline-disabled-reason">
          <AlertTriangle size={15} />
          Для закрытия выберите тематику. Это правило действует во всех ролях и каналах.
        </div>
      ) : null}
    </>
  );
}
