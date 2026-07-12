import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMfaOtpDeliveryFromEnv } from "../apps/api-gateway/src/identity/mfa-otp-delivery.ts";

const validSmtpEnv: NodeJS.ProcessEnv = {
  MFA_OTP_DELIVERY_MODE: "smtp",
  MFA_OTP_SMTP_FROM: "security@support-communication.local",
  MFA_OTP_SMTP_HOST: "smtp.support-communication.local",
  MFA_OTP_SMTP_PASSWORD: "smtp-password",
  MFA_OTP_SMTP_PORT: "465",
  MFA_OTP_SMTP_SECURE: "true",
  MFA_OTP_SMTP_TIMEOUT_MS: "5000",
  MFA_OTP_SMTP_TLS_REJECT_UNAUTHORIZED: "true",
  MFA_OTP_SMTP_USERNAME: "smtp-user",
  NODE_ENV: "production"
};

describe("MFA OTP delivery contracts", () => {
  it("fails closed unless staging and production explicitly select SMTP", () => {
    for (const nodeEnv of ["staging", "production"]) {
      for (const mode of [undefined, "deterministic", "noop", "disabled"]) {
        assert.throws(
          () => createMfaOtpDeliveryFromEnv({
            NODE_ENV: nodeEnv,
            ...(mode ? { MFA_OTP_DELIVERY_MODE: mode } : {})
          }),
          /mfa_otp_delivery_mode_smtp_required/
        );
      }
    }
  });

  it("provides deterministic no-op delivery in tests without exposing the OTP", async () => {
    const output: string[] = [];
    const originalLog = console.log;
    const originalError = console.error;
    console.log = (...values: unknown[]) => output.push(values.map(String).join(" "));
    console.error = (...values: unknown[]) => output.push(values.map(String).join(" "));

    try {
      const provider = createMfaOtpDeliveryFromEnv({ NODE_ENV: "test" });
      const input = {
        challengeId: "mfa_contract_001",
        email: "owner@example.com",
        expiresAt: "2026-07-10T12:30:00.000Z",
        otp: "826419"
      };
      const first = await provider.send(input);
      const repeated = await provider.send(input);

      assert.deepEqual(first, repeated);
      assert.match(first.providerMessageId, /^test-mfa-otp-[a-f0-9]{20}$/);
      assert.doesNotMatch(JSON.stringify(first), new RegExp(input.otp));
      assert.equal(output.join("\n"), "");
    } finally {
      console.log = originalLog;
      console.error = originalError;
    }
  });

  it("keeps OTP values out of validation errors and console output", async () => {
    const otp = "826419";
    const output: string[] = [];
    const originalLog = console.log;
    const originalError = console.error;
    console.log = (...values: unknown[]) => output.push(values.map(String).join(" "));
    console.error = (...values: unknown[]) => output.push(values.map(String).join(" "));

    try {
      const provider = createMfaOtpDeliveryFromEnv({ ...validSmtpEnv, NODE_ENV: "test" });
      const error = await provider.send({
        challengeId: "mfa_contract_002",
        email: "target@example.com\r\nBcc: attacker@example.com",
        expiresAt: "2026-07-10T12:30:00.000Z",
        otp
      }).then(
        () => null,
        (reason: unknown) => reason
      );

      assert.ok(error instanceof Error);
      assert.equal(error.message, "mfa_otp_delivery_input_invalid");
      assert.doesNotMatch(error.message, new RegExp(otp));
      assert.doesNotMatch(output.join("\n"), new RegExp(otp));
    } finally {
      console.log = originalLog;
      console.error = originalError;
    }
  });

  it("validates SMTP configuration at creation without opening a network connection", () => {
    assert.doesNotThrow(() => createMfaOtpDeliveryFromEnv(validSmtpEnv));

    const invalidCases: Array<[Partial<NodeJS.ProcessEnv>, RegExp]> = [
      [{ MFA_OTP_SMTP_FROM: "invalid-address" }, /mfa_otp_smtp_from_invalid/],
      [{ MFA_OTP_SMTP_HOST: "smtp.example.com\r\nINJECT" }, /mfa_otp_smtp_host_invalid/],
      [{ MFA_OTP_SMTP_PORT: "0" }, /mfa_otp_smtp_port_invalid/],
      [{ MFA_OTP_SMTP_PORT: "65536" }, /mfa_otp_smtp_port_invalid/],
      [{ MFA_OTP_SMTP_SECURE: "sometimes" }, /mfa_otp_smtp_secure_invalid/],
      [{ MFA_OTP_SMTP_TIMEOUT_MS: "NaN" }, /mfa_otp_smtp_timeout_invalid/],
      [{ MFA_OTP_SMTP_TIMEOUT_MS: "120001" }, /mfa_otp_smtp_timeout_invalid/],
      [{ MFA_OTP_SMTP_TLS_REJECT_UNAUTHORIZED: "maybe" }, /mfa_otp_smtp_tls_reject_unauthorized_invalid/],
      [{ MFA_OTP_SMTP_PASSWORD: "" }, /mfa_otp_smtp_auth_incomplete/]
    ];

    for (const [overrides, expected] of invalidCases) {
      assert.throws(
        () => createMfaOtpDeliveryFromEnv({ ...validSmtpEnv, ...overrides }),
        expected
      );
    }
  });

  it("uses MAIL fallbacks and development SMTP auto-selection", () => {
    assert.doesNotThrow(() => createMfaOtpDeliveryFromEnv({
      MAIL_FROM: "security@support-communication.local",
      MAIL_HOST: "127.0.0.1",
      MAIL_PASSWORD: "smtp-password",
      MAIL_PORT: "1025",
      MAIL_SECURE: "false",
      MAIL_TIMEOUT_MS: "2500",
      MAIL_TLS_REJECT_UNAUTHORIZED: "false",
      MAIL_USERNAME: "smtp-user",
      NODE_ENV: "development"
    }));
  });
});
