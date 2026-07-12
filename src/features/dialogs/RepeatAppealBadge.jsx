import React from "react";
import { RotateCcw } from "lucide-react";
import { isRepeatAppeal } from "../../app/dialogModel.js";

export function RepeatAppealBadge({ conversation, compact = false }) {
  if (!isRepeatAppeal(conversation)) {
    return null;
  }

  return (
    <span
      className={`repeat-appeal-badge${compact ? " compact" : ""}`}
      data-testid="repeat-appeal-badge"
      title="Клиент обратился повторно по той же тематике в течение 24 часов"
    >
      <RotateCcw aria-hidden="true" size={compact ? 13 : 14} />
      Повторное обращение
    </span>
  );
}
