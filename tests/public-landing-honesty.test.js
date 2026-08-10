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

  it("labels the product preview and demo scenario without fictional social proof", () => {
    assert.match(source, /Демонстрационный пример интерфейса/);
    assert.match(source, /без клиентских данных/);
    assert.match(source, /демонстрационный сценарий/);
    assert.doesNotMatch(source, /пример отзыва|примеры клиентов|НОРДВЭЙ|ОРБИТА/);
    assert.doesNotMatch(source, /−38%|100%.*журнал|за один день|через минуты|0\.9 с/);
  });

  it("keeps channel descriptions honest without presentation status labels", () => {
    for (const channel of ["Web SDK", "Telegram", "ВКонтакте", "MAX", "REST API", "WhatsApp", "Email", "Viber"]) {
      assert.match(source, new RegExp(`name: "${channel}",[^\\n]+text:`));
    }
    assert.match(source, /live-приёмка внешнего\s+провайдера/);
    assert.doesNotMatch(source, /public-channel-status|status: "|live: /);
    assert.doesNotMatch(source, /уже работают в продакшене|полный журнал аудита/);
  });

  it("does not invent an enterprise price and keeps trial claims card-free", () => {
    assert.match(source, /isEnterprise \? "Индивидуально" : formatTariffPrice\(tariff\.priceMonthly\)/);
    assert.match(source, /Контакт по запросу/);
    assert.match(source, /Карта не нужна/);
  });
});
