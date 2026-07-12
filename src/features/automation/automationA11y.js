/** Keyboard helpers for button-based radiogroups in the scenario wizard. */

export function getNextRadioOptionId(options = [], currentId, key) {
  const items = Array.isArray(options) ? options.filter((item) => item?.id != null) : [];
  if (!items.length) return null;

  const currentIndex = items.findIndex((item) => item.id === currentId);
  const index = currentIndex >= 0 ? currentIndex : 0;

  if (key === "ArrowRight" || key === "ArrowDown") {
    return items[(index + 1) % items.length].id;
  }
  if (key === "ArrowLeft" || key === "ArrowUp") {
    return items[(index - 1 + items.length) % items.length].id;
  }
  if (key === "Home") return items[0].id;
  if (key === "End") return items[items.length - 1].id;
  return items[index].id;
}

export function isRadioGroupNavigationKey(key) {
  return ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"].includes(String(key ?? ""));
}
