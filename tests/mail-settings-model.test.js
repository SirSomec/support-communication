import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildMailSettingsPayload,
  describeMailDeliverySource,
  describeMailTestState,
  emptyMailSettingsForm,
  mailEncryptionOptions,
  mailSettingsFormFromResponse,
  validateMailSettingsForm
} from "../src/features/settings/mailSettingsModel.js";

describe("mail settings form model", () => {
  it("maps masked server settings into form values with an always-empty password", () => {
    const form = mailSettingsFormFromResponse({
      enabled: true,
      encryption: "ssl",
      fromAddress: "noreply@company.ru",
      fromName: "Поддержка",
      host: "smtp.company.ru",
      passwordConfigured: true,
      port: 465,
      replyTo: null,
      username: "noreply@company.ru"
    });

    assert.equal(form.enabled, true);
    assert.equal(form.encryption, "ssl");
    assert.equal(form.host, "smtp.company.ru");
    assert.equal(form.port, "465");
    assert.equal(form.password, "");
    assert.equal(form.replyTo, "");
  });

  it("falls back to the empty form and a safe encryption value", () => {
    assert.deepEqual(mailSettingsFormFromResponse(null), emptyMailSettingsForm);
    assert.equal(mailSettingsFormFromResponse({ encryption: "weird" }).encryption, "starttls");
    assert.equal(mailEncryptionOptions.some((option) => option.value === "starttls"), true);
  });

  it("validates required fields, port range and email shapes", () => {
    const valid = {
      ...emptyMailSettingsForm,
      fromAddress: "noreply@company.ru",
      host: "smtp.company.ru",
      port: "587"
    };

    assert.equal(validateMailSettingsForm(valid), "");
    assert.match(validateMailSettingsForm({ ...valid, host: "" }), /SMTP/);
    assert.match(validateMailSettingsForm({ ...valid, host: "bad host" }), /хост/);
    assert.match(validateMailSettingsForm({ ...valid, port: "70000" }), /Порт/);
    assert.match(validateMailSettingsForm({ ...valid, port: "abc" }), /Порт/);
    assert.match(validateMailSettingsForm({ ...valid, fromAddress: "broken" }), /отправителя/);
    assert.match(validateMailSettingsForm({ ...valid, replyTo: "broken" }), /Reply-To/);
  });

  it("requires a password for a new username but accepts a stored one", () => {
    const withUsername = {
      ...emptyMailSettingsForm,
      fromAddress: "noreply@company.ru",
      host: "smtp.company.ru",
      username: "noreply@company.ru"
    };

    assert.match(validateMailSettingsForm(withUsername), /пароль/);
    assert.equal(validateMailSettingsForm(withUsername, { passwordConfigured: true }), "");
    assert.match(
      validateMailSettingsForm({ ...withUsername, username: "", password: "secret" }),
      /логин/
    );
  });

  it("builds the payload omitting an unchanged password and normalizing blanks", () => {
    const payload = buildMailSettingsPayload({
      ...emptyMailSettingsForm,
      enabled: true,
      fromAddress: " noreply@company.ru ",
      fromName: "  ",
      host: " smtp.company.ru ",
      port: " 587 ",
      replyTo: "",
      username: "  "
    });

    assert.equal(payload.host, "smtp.company.ru");
    assert.equal(payload.fromAddress, "noreply@company.ru");
    assert.equal(payload.port, 587);
    assert.equal(payload.fromName, null);
    assert.equal(payload.replyTo, null);
    assert.equal(payload.username, null);
    assert.equal("password" in payload, false);

    const withPassword = buildMailSettingsPayload({
      ...emptyMailSettingsForm,
      fromAddress: "noreply@company.ru",
      host: "smtp.company.ru",
      password: "new-secret",
      username: "login"
    });
    assert.equal(withPassword.password, "new-secret");
    assert.equal(withPassword.username, "login");
  });

  it("describes test state and delivery source in Russian", () => {
    assert.match(describeMailTestState(null), /не выполнялась/);
    assert.match(
      describeMailTestState({ lastTestStatus: "passed", lastTestedAt: "2026-07-18T10:00:00.000Z" }),
      /успешна/
    );
    assert.match(
      describeMailTestState({
        lastTestMessage: "smtp_timeout",
        lastTestStatus: "failed",
        lastTestedAt: "2026-07-18T10:00:00.000Z"
      }),
      /smtp_timeout/
    );

    assert.equal(describeMailDeliverySource({ enabled: true }, { configured: false }).key, "workspace");
    assert.equal(describeMailDeliverySource(null, { configured: true }).key, "environment");
    assert.equal(describeMailDeliverySource(null, { configured: false }).key, "none");
  });
});
