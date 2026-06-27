export function createScreenStateItems({
  loading = "готово",
  total = 1,
  empty = "данные есть",
  emptyWhenZero = "нет данных",
  errors = 0,
  errorLabel = "нет ошибок"
}) {
  return [
    { label: "Загрузка", value: loading, tone: "ok" },
    { label: total ? "Данные" : "Пусто", value: total ? empty : emptyWhenZero, tone: total ? "ok" : "empty" },
    { label: "Ошибки", value: errors ? `${errors} требуют внимания` : errorLabel, tone: errors ? "error" : "ok" }
  ];
}
