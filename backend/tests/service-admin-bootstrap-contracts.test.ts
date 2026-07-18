import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AuthService } from "../apps/api-gateway/src/identity/auth.service.ts";
import {
  IdentityRepository,
  verifyPasswordCredential
} from "../apps/api-gateway/src/identity/identity.repository.ts";
import { createMfaOtpRuntime } from "../apps/api-gateway/src/identity/mfa-otp.ts";
import { bootstrapServiceAdminFromEnv } from "../apps/api-gateway/src/identity/service-admin-bootstrap.ts";

const ADMIN_EMAIL = "root-admin@platform.example";
const ADMIN_PASSWORD = "Very-Strong-Password-2026";

function bootstrapEnvironment(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    BOOTSTRAP_SERVICE_ADMIN_EMAIL: ADMIN_EMAIL,
    BOOTSTRAP_SERVICE_ADMIN_PASSWORD: ADMIN_PASSWORD,
    ...overrides
  };
}

describe("service admin bootstrap contracts", () => {
  it("skips silently when both variables are empty", async () => {
    const repository = IdentityRepository.inMemory();
    const result = await bootstrapServiceAdminFromEnv({}, repository);
    assert.equal(result.outcome, "skipped");
    assert.equal(await repository.findPasswordCredentialByEmail(ADMIN_EMAIL), undefined);
  });

  it("fails closed on an incomplete or invalid configuration", async () => {
    const repository = IdentityRepository.inMemory();

    await assert.rejects(
      () => bootstrapServiceAdminFromEnv({ BOOTSTRAP_SERVICE_ADMIN_EMAIL: ADMIN_EMAIL }, repository),
      /bootstrap_service_admin_config_incomplete/
    );
    await assert.rejects(
      () => bootstrapServiceAdminFromEnv(bootstrapEnvironment({ BOOTSTRAP_SERVICE_ADMIN_EMAIL: "not-an-email" }), repository),
      /bootstrap_service_admin_email_invalid/
    );
    await assert.rejects(
      () => bootstrapServiceAdminFromEnv(bootstrapEnvironment({ BOOTSTRAP_SERVICE_ADMIN_PASSWORD: "short-pass" }), repository),
      /bootstrap_service_admin_password_too_short/
    );
  });

  it("creates a scrypt credential with a svc-admin subject and never logs the password", async () => {
    const repository = IdentityRepository.inMemory();
    const output: string[] = [];
    const originalLog = console.log;
    console.log = (...values: unknown[]) => output.push(values.map(String).join(" "));

    try {
      const result = await bootstrapServiceAdminFromEnv(bootstrapEnvironment(), repository);
      assert.equal(result.outcome, "created");
      assert.match(String(result.subjectId), /^svc-admin-[a-f0-9]{12}$/);

      const credential = await repository.findPasswordCredentialByEmail(ADMIN_EMAIL);
      assert.ok(credential);
      assert.equal(credential?.algorithm, "scrypt");
      assert.equal(credential?.subjectId, result.subjectId);
      assert.equal(verifyPasswordCredential(ADMIN_PASSWORD, credential), true);
      assert.equal(verifyPasswordCredential("wrong-password-123", credential), false);
      assert.doesNotMatch(output.join("\n"), new RegExp(ADMIN_PASSWORD));
    } finally {
      console.log = originalLog;
    }
  });

  it("is idempotent: an existing svc-admin credential is left untouched", async () => {
    const repository = IdentityRepository.inMemory();
    await bootstrapServiceAdminFromEnv(bootstrapEnvironment(), repository);
    const first = await repository.findPasswordCredentialByEmail(ADMIN_EMAIL);

    const repeated = await bootstrapServiceAdminFromEnv(
      bootstrapEnvironment({ BOOTSTRAP_SERVICE_ADMIN_PASSWORD: "Another-Strong-Password-2026" }),
      repository
    );
    assert.equal(repeated.outcome, "exists");
    const second = await repository.findPasswordCredentialByEmail(ADMIN_EMAIL);
    assert.equal(second?.hash, first?.hash);
    assert.equal(verifyPasswordCredential(ADMIN_PASSWORD, second), true);
  });

  it("rejects an email owned by a tenant user or a non-service-admin credential", async () => {
    const repository = IdentityRepository.inMemory();
    await repository.saveTenantUser({
      id: "usr-collision",
      tenantId: "tenant-volga",
      name: "Collision User",
      email: ADMIN_EMAIL,
      role: "Admin",
      status: "active",
      mfa: "enabled",
      metadata: {},
      inviteStatus: "accepted",
      lastActiveAt: null,
      sessions: 0,
      risk: "low",
      device: "test",
      supportNotes: ""
    });
    await assert.rejects(
      () => bootstrapServiceAdminFromEnv(bootstrapEnvironment(), repository),
      /bootstrap_service_admin_email_belongs_to_tenant_user/
    );

    const conflictRepository = IdentityRepository.inMemory();
    await conflictRepository.savePasswordCredential({
      algorithm: "scrypt",
      email: ADMIN_EMAIL,
      hash: "hash",
      subjectId: "usr-not-an-admin",
      updatedAt: new Date().toISOString(),
      version: 1
    });
    await assert.rejects(
      () => bootstrapServiceAdminFromEnv(bootstrapEnvironment(), conflictRepository),
      /bootstrap_service_admin_email_conflict/
    );
  });

  it("lets the bootstrapped admin complete the full password + OTP login", async () => {
    const repository = IdentityRepository.inMemory();
    const bootstrapped = await bootstrapServiceAdminFromEnv(bootstrapEnvironment(), repository);

    // Основной runtime (тенантские рассылки, настройки служебной почты) не
    // должен участвовать в сервис-админском логине: временный обход шлёт MFA
    // администратора сервиса только через env-runtime.
    const tenantDeliveries: string[] = [];
    const mfaRuntime = createMfaOtpRuntime({
      delivery: {
        async send(input) {
          tenantDeliveries.push(input.email);
          return { providerMessageId: "test-bootstrap-delivery" };
        },
        async sendRecovery() {
          return { providerMessageId: "test-bootstrap-recovery" };
        }
      },
      generateOtp: () => "123456",
      hashKey: "bootstrap-contract-hash-key"
    });
    const serviceAdminDeliveries: string[] = [];
    const serviceAdminRuntime = createMfaOtpRuntime({
      delivery: {
        async send(input) {
          serviceAdminDeliveries.push(input.email);
          return { providerMessageId: "test-bootstrap-admin-delivery" };
        }
      },
      generateOtp: () => "123456",
      hashKey: "bootstrap-contract-hash-key"
    });
    const authService = new AuthService(repository, mfaRuntime, serviceAdminRuntime);

    const passwordStep = await authService.login({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    assert.equal(passwordStep.status, "ok");
    assert.equal(passwordStep.data.authState, "mfa_required");
    const challengeId = String((passwordStep.data as Record<string, unknown>).mfaChallengeId);
    assert.ok(challengeId);

    // Шаг OTP повторяет и пароль: login() валидирует credential заново перед
    // потреблением MFA-челленджа.
    const otpStep = await authService.login({
      email: ADMIN_EMAIL,
      mfaChallengeId: challengeId,
      otp: "123456",
      password: ADMIN_PASSWORD
    });
    assert.equal(otpStep.status, "ok");
    assert.equal(otpStep.data.authenticated, true);
    assert.equal(otpStep.data.authState, "mfa_verified");
    const session = (otpStep.data as Record<string, Record<string, unknown>>).session;
    assert.equal(session.adminId, bootstrapped.subjectId);
    assert.equal(session.adminEmail, ADMIN_EMAIL);

    // Временный обход: MFA-письмо сервис-админа ушло через выделенный
    // env-runtime, основной runtime не задействован.
    assert.deepEqual(serviceAdminDeliveries, [ADMIN_EMAIL]);
    assert.deepEqual(tenantDeliveries, []);

    const wrongPassword = await authService.login({ email: ADMIN_EMAIL, password: "Wrong-Password-2026!" });
    assert.equal(wrongPassword.status, "denied");
    assert.equal(wrongPassword.error?.code, "invalid_credentials");
  });
});
