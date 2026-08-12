const IMPORT_FIELD_ALIASES = new Map([
  ["clientid", "clientId"],
  ["client id", "clientId"],
  ["id", "clientId"],
  ["id клиента", "clientId"],
  ["ид клиента", "clientId"],
  ["идентификатор клиента", "clientId"],
  ["externalid", "externalId"],
  ["external id", "externalId"],
  ["внешний id", "externalId"],
  ["внешний ид", "externalId"],
  ["внешний идентификатор", "externalId"],
  ["sourceprofileid", "sourceProfileId"],
  ["source profile id", "sourceProfileId"],
  ["id профиля", "sourceProfileId"],
  ["phone", "phone"],
  ["telephone", "phone"],
  ["tel", "phone"],
  ["mobile", "phone"],
  ["телефон", "phone"],
  ["номер телефона", "phone"],
  ["мобильный телефон", "phone"],
  ["email", "email"],
  ["mail", "email"],
  ["почта", "email"],
  ["электронная почта", "email"],
  ["эл почта", "email"]
]);

function normalizeHeader(value) {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[._-]+/g, " ")
    .replace(/[^a-zа-я0-9 ]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function importValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  return "";
}

export function normalizeAudienceImportRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return {};
  return Object.fromEntries(Object.entries(record).map(([header, value]) => {
    const normalizedHeader = normalizeHeader(header);
    return [IMPORT_FIELD_ALIASES.get(normalizedHeader) ?? header.replace(/^\uFEFF/, "").trim(), importValue(value)];
  }));
}

export function normalizeAudienceImportRecords(records) {
  return Array.isArray(records) ? records.map(normalizeAudienceImportRecord) : [];
}

function delimiterFor(text) {
  const firstLine = String(text).replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] ?? "";
  const counts = [["\t", 0], [";", 0], [",", 0]];
  let quoted = false;
  for (const character of firstLine) {
    if (character === '"') quoted = !quoted;
    if (!quoted) {
      const item = counts.find(([delimiter]) => delimiter === character);
      if (item) item[1] += 1;
    }
  }
  return counts.sort((left, right) => right[1] - left[1])[0][0];
}

function parseDelimitedRows(text, delimiter) {
  const rows = [];
  let cell = "";
  let row = [];
  let quoted = false;
  const input = String(text).replace(/^\uFEFF/, "");
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character === '"') {
      if (quoted && input[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (!quoted && character === delimiter) {
      row.push(cell.trim()); cell = "";
    } else if (!quoted && (character === "\n" || character === "\r")) {
      if (character === "\r" && input[index + 1] === "\n") index += 1;
      row.push(cell.trim()); cell = "";
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else cell += character;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

export function rowsToAudienceRecords(rows) {
  const [headers = [], ...body] = Array.isArray(rows) ? rows : [];
  return normalizeAudienceImportRecords(body
    .filter((row) => Array.isArray(row) && row.some((cell) => cell !== null && cell !== ""))
    .map((row) => Object.fromEntries(headers.map((header, index) => [String(header ?? "").trim(), row[index] ?? ""]))));
}

export function parseAudienceCsv(text) {
  return rowsToAudienceRecords(parseDelimitedRows(text, delimiterFor(text)));
}

export async function parseAudienceXlsx(file, readSheet) {
  if (typeof readSheet !== "function") throw new TypeError("XLSX reader is unavailable");
  return rowsToAudienceRecords(await readSheet(file));
}
