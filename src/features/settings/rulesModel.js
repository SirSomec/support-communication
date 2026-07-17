export function normalizeRuleParameter(currentValue, nextValue) {
  if (typeof currentValue === "number") {
    const text = String(nextValue ?? "").trim();
    if (!text) return { changed: false, value: currentValue };
    const numericValue = Number(text);
    if (!Number.isFinite(numericValue)) return { changed: false, value: currentValue };
    return { changed: numericValue !== currentValue, value: numericValue };
  }

  return { changed: nextValue !== currentValue, value: nextValue };
}
