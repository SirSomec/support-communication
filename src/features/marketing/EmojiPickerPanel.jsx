import React from "react";
import EmojiPicker from "emoji-picker-react";
import russianEmojiData from "emoji-picker-react/dist/data/emojis-ru.js";

export default function EmojiPickerPanel({ onEmojiSelect }) {
  return <EmojiPicker
    autoFocusSearch
    emojiData={russianEmojiData}
    emojiStyle="native"
    height={360}
    lazyLoadEmojis
    onEmojiClick={(emojiData) => onEmojiSelect(emojiData.emoji)}
    previewConfig={{ showPreview: false }}
    searchClearButtonLabel="Очистить поиск"
    searchPlaceholder="Поиск эмодзи"
    suggestedEmojisMode="recent"
    width="100%"
  />;
}
