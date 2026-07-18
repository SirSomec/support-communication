import assert from "node:assert/strict";
import { createServer, type AddressInfo } from "node:net";
import { describe, it } from "node:test";
import { IdentityRepository } from "../apps/api-gateway/src/identity/identity.repository.ts";
import { SettingsEmployeeService } from "../apps/api-gateway/src/identity/settings-employee.service.ts";
import { TeamDirectoryRepository } from "../apps/api-gateway/src/identity/team-directory.repository.ts";
import { MailSettingsRepository } from "../apps/api-gateway/src/mail/mail-settings.repository.ts";
import { MailSettingsService } from "../apps/api-gateway/src/mail/mail-settings.service.ts";
import {
  createInviteMailDeliveryFromEnv,
  createWorkspaceMailOverrideResolver
} from "../apps/api-gateway/src/mail/workspace-mailer.ts";

const MASTER_KEY = Buffer.alloc(32, 7).toString("base64");
const secureEnvironment: NodeJS.ProcessEnv = {
  MAIL_SETTINGS_KEY_VERSION: "test-v1",
  MAIL_SETTINGS_MASTER_KEY: MASTER_KEY,
  NODE_ENV: "test"
};

const validSettingsInput = {
  enabled: true,
  encryption: "none",
  fromAddress: "noreply@volga.example",
  fromName: "Служба поддержки",
  host: "127.0.0.1",
  password: "smtp-secret-password",
  port: 2525,
  username: "smtp-user"
};

describe("workspace mail settings contracts", () => {
  it("saves settings with an encrypted password and never returns the secret", async () => {
    const repository = MailSettingsRepository.inMemory();
    const service = new MailSettingsService(repository, secureEnvironment);

    const saved = await service.save("tenant-volga", validSettingsInput);
    assert.equal(saved.status, "ok");
    const settings = saved.data.settings as Record<string, unknown>;
    assert.equal(settings.passwordConfigured, true);
    assert.equal(settings.host, "127.0.0.1");
    assert.equal(settings.username, "smtp-user");
    assert.doesNotMatch(JSON.stringify(saved), /smtp-secret-password/);

    const stored = await repository.find("tenant-volga");
    assert.ok(stored?.secret);
    assert.notEqual(stored?.secret?.ciphertext, "smtp-secret-password");
    assert.doesNotMatch(JSON.stringify(stored?.secret ?? {}), /smtp-secret-password/);

    const fetched = await service.fetch("tenant-volga");
    assert.equal(fetched.status, "ok");
    assert.doesNotMatch(JSON.stringify(fetched), /smtp-secret-password/);
    assert.equal((fetched.data.settings as Record<string, unknown>).passwordConfigured, true);
  });

  it("keeps the stored password when the field is omitted and clears it with the username", async () => {
    const repository = MailSettingsRepository.inMemory();
    const service = new MailSettingsService(repository, secureEnvironment);
    await service.save("tenant-volga", validSettingsInput);

    const withoutPassword = await service.save("tenant-volga", { ...validSettingsInput, password: undefined });
    assert.equal(withoutPassword.status, "ok");
    assert.equal((withoutPassword.data.settings as Record<string, unknown>).passwordConfigured, true);

    const withoutAuth = await service.save("tenant-volga", {
      ...validSettingsInput,
      password: undefined,
      username: ""
    });
    assert.equal(withoutAuth.status, "ok");
    assert.equal((withoutAuth.data.settings as Record<string, unknown>).passwordConfigured, false);
    assert.equal((await repository.find("tenant-volga"))?.secret, null);
  });

  it("rejects invalid payloads with specific error codes", async () => {
    const service = new MailSettingsService(MailSettingsRepository.inMemory(), secureEnvironment);

    const badHost = await service.save("tenant-volga", { ...validSettingsInput, host: "bad host\r\n" });
    assert.equal(badHost.status, "invalid");
    assert.equal(badHost.error?.code, "mail_settings_host_invalid");

    const badPort = await service.save("tenant-volga", { ...validSettingsInput, port: 70_000 });
    assert.equal(badPort.error?.code, "mail_settings_port_invalid");

    const badFrom = await service.save("tenant-volga", { ...validSettingsInput, fromAddress: "not-an-email" });
    assert.equal(badFrom.error?.code, "mail_settings_from_invalid");

    const authIncomplete = await service.save("tenant-volga", {
      ...validSettingsInput,
      password: "",
      username: "smtp-user"
    });
    assert.equal(authIncomplete.error?.code, "mail_settings_auth_incomplete");
  });

  it("reports secret storage unavailability without leaking the password", async () => {
    const service = new MailSettingsService(MailSettingsRepository.inMemory(), { NODE_ENV: "test" });
    const result = await service.save("tenant-volga", validSettingsInput);

    assert.equal(result.status, "invalid");
    assert.equal(result.error?.code, "mail_settings_secret_unavailable");
    assert.doesNotMatch(JSON.stringify(result), /smtp-secret-password/);
  });

  it("sends the test email through saved settings and records the outcome", async () => {
    const repository = MailSettingsRepository.inMemory();
    const sentMessages: Array<{ message: string; to: string }> = [];
    const service = new MailSettingsService(repository, secureEnvironment, async (config, mail) => {
      assert.equal(config.auth?.password, "smtp-secret-password");
      sentMessages.push(mail);
      return "fake-queued-id";
    });
    await service.save("tenant-volga", validSettingsInput);

    const passed = await service.sendTest("tenant-volga", { recipient: "admin@volga.example" });
    assert.equal(passed.status, "ok");
    assert.equal((passed.data.test as Record<string, Record<string, unknown>>).diagnostic.code, "ok");
    assert.equal(sentMessages.length, 1);
    assert.equal(sentMessages[0]?.to, "admin@volga.example");
    assert.match(sentMessages[0]?.message ?? "", /=\?UTF-8\?B\?/);
    assert.match(sentMessages[0]?.message ?? "", /From: =\?UTF-8\?B\?[^\r\n]+ <noreply@volga\.example>/);
    const settingsAfterPass = (passed.data.settings as Record<string, unknown>);
    assert.equal(settingsAfterPass.lastTestStatus, "passed");

    const failingService = new MailSettingsService(repository, secureEnvironment, async () => {
      throw new Error("smtp_timeout");
    });
    const failed = await failingService.sendTest("tenant-volga", { recipient: "admin@volga.example" });
    assert.equal(failed.status, "invalid");
    assert.equal(failed.error?.code, "mail_settings_test_failed");
    assert.equal((failed.data.test as Record<string, Record<string, unknown>>).diagnostic.code, "smtp_timeout");
    assert.equal((failed.data.settings as Record<string, unknown>).lastTestStatus, "failed");
  });

  it("requires saved settings and a valid recipient before testing", async () => {
    const service = new MailSettingsService(MailSettingsRepository.inMemory(), secureEnvironment);

    const notConfigured = await service.sendTest("tenant-volga", { recipient: "admin@volga.example" });
    assert.equal(notConfigured.error?.code, "mail_settings_not_configured");

    await service.save("tenant-volga", validSettingsInput);
    const badRecipient = await service.sendTest("tenant-volga", { recipient: "broken" });
    assert.equal(badRecipient.error?.code, "mail_settings_recipient_invalid");
  });
});

describe("workspace mail override resolver contracts", () => {
  it("resolves the workspace transport for an enabled tenant and stays null otherwise", async () => {
    const repository = MailSettingsRepository.inMemory();
    const service = new MailSettingsService(repository, secureEnvironment);
    await service.save("tenant-volga", validSettingsInput);
    const resolver = createWorkspaceMailOverrideResolver({
      environment: secureEnvironment,
      repository: () => repository
    });

    const override = await resolver({ email: "operator@volga.example", tenantId: "tenant-volga" });
    assert.ok(override);
    assert.equal(override?.from, "noreply@volga.example");

    assert.equal(await resolver({ email: "operator@volga.example", tenantId: "tenant-unknown" }), null);

    await service.save("tenant-volga", { ...validSettingsInput, enabled: false, password: undefined });
    assert.equal(await resolver({ email: "operator@volga.example", tenantId: "tenant-volga" }), null);
  });

  it("resolves tenants by email and treats multi-tenant matches as ambiguous", async () => {
    const repository = MailSettingsRepository.inMemory();
    const service = new MailSettingsService(repository, secureEnvironment);
    await service.save("tenant-volga", validSettingsInput);
    await service.save("tenant-neva", { ...validSettingsInput, fromAddress: "noreply@neva.example" });

    const singleTenant = createWorkspaceMailOverrideResolver({
      environment: secureEnvironment,
      findTenantIdsByEmail: () => ["tenant-volga"],
      repository: () => repository
    });
    assert.equal((await singleTenant({ email: "operator@volga.example" }))?.from, "noreply@volga.example");

    const ambiguous = createWorkspaceMailOverrideResolver({
      environment: secureEnvironment,
      findTenantIdsByEmail: () => ["tenant-volga", "tenant-neva"],
      repository: () => repository
    });
    assert.equal(await ambiguous({ email: "operator@both.example" }), null);
  });

  it("falls back to null when the secret cannot be decrypted", async () => {
    const repository = MailSettingsRepository.inMemory();
    const service = new MailSettingsService(repository, secureEnvironment);
    await service.save("tenant-volga", validSettingsInput);

    const resolver = createWorkspaceMailOverrideResolver({
      environment: { NODE_ENV: "test" },
      repository: () => repository
    });
    assert.equal(await resolver({ email: "operator@volga.example", tenantId: "tenant-volga" }), null);
  });
});

describe("invite mail delivery contracts", () => {
  const inviteInput = {
    code: "invite_12345678-1234-1234-1234-123456789abc",
    email: "employee@volga.example",
    expiresAt: "2026-07-25T12:00:00.000Z",
    inviteeName: "Новый Сотрудник",
    tenantId: "tenant-volga"
  };

  it("stays deterministic in tests without leaking the invite code", async () => {
    const delivery = createInviteMailDeliveryFromEnv({ NODE_ENV: "test" });
    const first = await delivery.sendInvite(inviteInput);
    const repeated = await delivery.sendInvite(inviteInput);

    assert.deepEqual(first, repeated);
    assert.match(first.providerMessageId, /^test-invite-[a-f0-9]{20}$/);
    assert.doesNotMatch(JSON.stringify(first), /invite_12345678/);
  });

  it("fails closed in staging without an smtp mode", () => {
    assert.throws(
      () => createInviteMailDeliveryFromEnv({ NODE_ENV: "staging" }),
      /service_mail_delivery_mode_smtp_required/
    );
  });

  it("delivers the invite email through workspace SMTP settings", async () => {
    const messages: string[] = [];
    const server = createServer((socket) => {
      let buffer = "";
      let dataLines: string[] | null = null;

      socket.setEncoding("utf8");
      socket.write("220 invite-contract SMTP\r\n");
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
              socket.write("250 queued as invite-contract-message\r\n");
            } else {
              dataLines.push(line);
            }
          } else if (line.startsWith("EHLO ")) {
            socket.write("250 invite-contract\r\n");
          } else if (line.startsWith("AUTH PLAIN ")) {
            socket.write("235 ok\r\n");
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
      const repository = MailSettingsRepository.inMemory();
      const settingsService = new MailSettingsService(repository, secureEnvironment);
      await settingsService.save("tenant-volga", { ...validSettingsInput, port });

      const delivery = createInviteMailDeliveryFromEnv(
        { ...secureEnvironment, NODE_ENV: "staging", SERVICE_MAIL_DELIVERY_MODE: "smtp" },
        { repository: () => repository }
      );
      const result = await delivery.sendInvite(inviteInput);

      assert.equal(result.providerMessageId, "smtp-invite-contract-message");
      assert.equal(messages.length, 1);
      const message = messages[0] ?? "";
      assert.match(message, /Subject: =\?UTF-8\?B\?/);
      assert.match(message, /invite_12345678-1234-1234-1234-123456789abc/);
      assert.match(message, /To: employee@volga\.example/);
      assert.match(message, /From: =\?UTF-8\?B\?[^\r\n]+ <noreply@volga\.example>/);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });
});

describe("employee invite email integration", () => {
  it("marks the invite as sent when delivery succeeds and failed when it throws", async () => {
    const identityRepository = IdentityRepository.inMemory();
    const teamDirectoryRepository = TeamDirectoryRepository.inMemory();
    const deliveries: Array<Record<string, unknown>> = [];
    const service = new SettingsEmployeeService(identityRepository, teamDirectoryRepository, undefined, {
      async sendInvite(input) {
        deliveries.push({ ...input });
        return { providerMessageId: "fake-invite-delivery" };
      }
    });

    const invited = await service.inviteEmployee(
      { email: "new.employee@volga.example", name: "Новый Сотрудник", roleKey: "employee" },
      { tenantId: "tenant-volga" }
    );
    assert.equal(invited.status, "ok");
    const descriptor = invited.data.inviteDescriptor as Record<string, unknown>;
    assert.equal(descriptor.deliveryState, "sent");
    assert.equal(deliveries.length, 1);
    assert.equal(deliveries[0]?.email, "new.employee@volga.example");
    assert.equal(deliveries[0]?.tenantId, "tenant-volga");
    assert.match(String(deliveries[0]?.code ?? ""), /^invite_/);

    const failingService = new SettingsEmployeeService(identityRepository, teamDirectoryRepository, undefined, {
      async sendInvite() {
        throw new Error("invite_mail_smtp_delivery_failed");
      }
    });
    const failed = await failingService.inviteEmployee(
      { email: "second.employee@volga.example", name: "Второй Сотрудник", roleKey: "employee" },
      { tenantId: "tenant-volga" }
    );
    assert.equal(failed.status, "ok");
    assert.equal((failed.data.inviteDescriptor as Record<string, unknown>).deliveryState, "failed");
  });
});
