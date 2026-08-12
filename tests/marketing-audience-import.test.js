import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeAudienceImportRecords, parseAudienceCsv, rowsToAudienceRecords } from "../src/features/marketing/audienceImportModel.js";

describe("marketing audience file import", () => {
  it("maps common Russian headers and keeps numeric Excel phones", () => {
    assert.deepEqual(rowsToAudienceRecords([
      ["Номер телефона", "Почта"],
      [79991234567, " user@example.ru "]
    ]), [{ phone: "79991234567", email: "user@example.ru" }]);
  });

  it("parses quoted CSV values, BOM headers and semicolon delimiters", () => {
    assert.deepEqual(parseAudienceCsv('\uFEFFТелефон;Электронная почта\r\n"+7 (999) 123-45-67";"user@example.ru"'), [{
      phone: "+7 (999) 123-45-67",
      email: "user@example.ru"
    }]);
  });

  it("normalizes technical JSON aliases without dropping identifiers", () => {
    assert.deepEqual(normalizeAudienceImportRecords([{ client_id: "client-1", external_id: 42 }]), [{ clientId: "client-1", externalId: "42" }]);
  });
});
