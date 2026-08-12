export function insertEmojiAtSelection(text, emoji, selectionStart, selectionEnd, maxLength = 4_000) {
  const source = String(text ?? "");
  const insertion = String(emoji ?? "");
  const start = clampSelection(selectionStart, source.length);
  const end = Math.max(start, clampSelection(selectionEnd, source.length));
  const availableLength = Math.max(0, maxLength - (source.length - (end - start)));
  const acceptedEmoji = insertion.length <= availableLength ? insertion : "";
  const value = `${source.slice(0, start)}${acceptedEmoji}${source.slice(end)}`;
  return { cursor: start + acceptedEmoji.length, value };
}

function clampSelection(value, length) {
  const number = Number(value);
  return Number.isInteger(number) ? Math.max(0, Math.min(number, length)) : length;
}
