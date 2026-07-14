import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("public landing honesty contracts", () => {
  const source = readFileSync(new URL("../src/features/public/LandingPage.jsx", import.meta.url), "utf8");

  it("uses live public health and the canonical tariff catalog", () => {
    assert.match(source, /publicCatalogService\.fetchHealth\(\)/);
    assert.match(source, /publicCatalogService\.fetchTariffs\(\)/);
    assert.match(source, /tariff\.priceMonthly/);
    assert.doesNotMatch(source, /19 900|49 900|99\.98%|p95 184|126 активных|82% в SLA|37% закрыто/);
  });

  it("labels the product preview and social proof as illustrative", () => {
    assert.match(source, /Демонстрационный пример интерфейса/);
    assert.match(source, /без клиентских данных/);
    assert.match(source, /пример отзыва/);
    assert.match(source, /примеры клиентов/);
  });

  it("marks only production channels as working and pending channels as pending", () => {
    for (const channel of ["Web SDK", "Telegram", "ВКонтакте", "MAX", "REST API"]) {
      assert.match(source, new RegExp(`name: "${channel}",[^\\n]+status: "работает"`));
    }
    for (const channel of ["WhatsApp", "Email", "Viber"]) {
      assert.match(source, new RegExp(`name: "${channel}",[^\\n]+status: "на подключении"`));
      assert.doesNotMatch(source, new RegExp(`name: "${channel}",[^\\n]+status: "работает"`));
    }
  });

  it("does not invent an enterprise price and keeps trial claims card-free", () => {
    assert.match(source, /isEnterprise \? "Индивидуально" : formatTariffPrice\(tariff\.priceMonthly\)/);
    assert.match(source, /Контакт по запросу/);
    assert.match(source, /Карта не нужна/);
  });
});
