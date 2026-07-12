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

  it("labels the product preview as illustrative and uses the real widget API", () => {
    assert.match(source, /Демонстрационный пример интерфейса/);
    assert.match(source, /SupportWidget\.init/);
    assert.match(source, /apiBase:/);
    assert.match(source, /publicKey:/);
    assert.match(source, /externalId:/);
    assert.doesNotMatch(source, /window\.SupportCom\.init/);
  });

  it("does not present unfinished channels and external AI as working", () => {
    assert.match(source, /\["MAX"[^\n]+"В разработке"\]/);
    assert.match(source, /\["VK"[^\n]+"В разработке"\]/);
    assert.match(source, /\["Внешний ИИ"[^\n]+"В разработке"\]/);
  });
});
