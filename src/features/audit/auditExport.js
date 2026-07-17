export function csvCell(value) {
  const text = String(value ?? "");
  const safeText = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
  return /[";\n\r]/.test(safeText) ? `"${safeText.replace(/"/g, "\"\"")}"` : safeText;
}
