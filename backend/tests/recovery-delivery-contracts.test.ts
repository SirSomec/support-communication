import assert from "node:assert/strict";
import { createServer, type AddressInfo } from "node:net";
import { describe, it } from "node:test";
import { createMfaOtpDeliveryFromEnv } from "../apps/api-gateway/src/identity/mfa-otp-delivery.ts";

const recoveryInput = {
  email: "operator@example.com",
  expiresAt: "2026-07-10T12:30:00.000Z",
  recoveryToken: "recovery_12345678-1234-1234-1234-123456789abc",
  requestId: "rcv_contract_001"
};

describe("password recovery delivery contracts", () => {
  it("keeps deterministic delivery stable without returning the recovery token", async () => {
    const delivery = createMfaOtpDeliveryFromEnv({ NODE_ENV: "test" });
    assert.equal(typeof delivery.sendRecovery, "function");

    const first = await delivery.sendRecovery(recoveryInput);
    const repeated = await delivery.sendRecovery(recoveryInput);

    assert.deepEqual(first, repeated);
    assert.match(first.providerMessageId, /^test-password-recovery-[a-f0-9]{20}$/);
    assert.doesNotMatch(JSON.stringify(first), new RegExp(recoveryInput.recoveryToken));
  });

  it("delivers the recovery token through SMTP in staging without returning it", async () => {
    const messages: string[] = [];
    const server = createServer((socket) => {
      let buffer = "";
      let dataLines: string[] | null = null;

      socket.setEncoding("utf8");
      socket.write("220 recovery-contract SMTP\r\n");
      socket.on("data", (chunk) => {
        buffer += chunk;
        let lineEnd = buffer.indexOf("\r\n");
        while (lineEnd >= 0) {
          const line = buffer.slice(0, lineEnd);
          buffer = buffer.slice(lineEnd + 2);

          if (dataLines) {
            if (line === ".") {
              messages.push(dataLines.join("\r\n"));
              dataLines = null;
              socket.write("250 queued as recovery-contract-message\r\n");
            } else {
              dataLines.push(line);
            }
          } else if (line.startsWith("EHLO ")) {
            socket.write("250 recovery-contract\r\n");
          } else if (line.startsWith("MAIL FROM:") || line.startsWith("RCPT TO:")) {
            socket.write("250 ok\r\n");
          } else if (line === "DATA") {
            dataLines = [];
            socket.write("354 end with dot\r\n");
          } else if (line === "QUIT") {
            socket.write("221 bye\r\n");
          }

          lineEnd = buffer.indexOf("\r\n");
        }
      });
    });

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });

    try {
      const { port } = server.address() as AddressInfo;
      const delivery = createMfaOtpDeliveryFromEnv({
        MFA_OTP_DELIVERY_MODE: "smtp",
        MFA_OTP_SMTP_FROM: "security@example.com",
        MFA_OTP_SMTP_HOST: "127.0.0.1",
        MFA_OTP_SMTP_PORT: String(port),
        MFA_OTP_SMTP_SECURE: "false",
        MFA_OTP_SMTP_TIMEOUT_MS: "2000",
        NODE_ENV: "staging"
      });
      assert.equal(typeof delivery.sendRecovery, "function");

      const result = await delivery.sendRecovery(recoveryInput);

      assert.equal(result.providerMessageId, "smtp-recovery-contract-message");
      assert.doesNotMatch(JSON.stringify(result), new RegExp(recoveryInput.recoveryToken));
      assert.equal(messages.length, 1);
      assert.match(messages[0] ?? "", /Subject: Password recovery request/);
      assert.match(messages[0] ?? "", new RegExp(recoveryInput.recoveryToken));
      assert.match(messages[0] ?? "", /Request reference: rcv_contract_001/);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });
});
