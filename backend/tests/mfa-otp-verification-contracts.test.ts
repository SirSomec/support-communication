import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { AuthService } from "../apps/api-gateway/src/identity/auth.service.js";
import { IdentityRepository } from "../apps/api-gateway/src/identity/identity.repository.js";
import { createMfaOtpRuntime, createMfaOtpRuntimeFromEnv } from "../apps/api-gateway/src/identity/mfa-otp.js";

const backendRoot = fileURLToPath(new URL("..", import.meta.url));

describe("MFA OTP verification", () => {
  it("uses the fixed smoke code only with a local deterministic delivery provider", () => {
    const localRuntime = createMfaOtpRuntimeFromEnv({
      MFA_OTP_DELIVERY_MODE: "deterministic",
      NODE_ENV: "development"
    });

    assert.equal(localRuntime.issue("operator@example.com").otp, "123456");
    assert.throws(
      () => createMfaOtpRuntimeFromEnv({
        JWT_ACCESS_SECRET: "staging-access-secret-2026",
        MFA_OTP_DELIVERY_MODE: "deterministic",
        NODE_ENV: "staging"
      }),
      /mfa_otp_delivery_mode_smtp_required/
    );
  });

  it("denies an arbitrary non-empty OTP and issues a session only for the delivered code", async () => {
    const delivered: Array<{ challengeId: string; email: string; otp: string }> = [];
    const auth = new AuthService(
      IdentityRepository.inMemory(),
      createMfaOtpRuntime({
        delivery: {
          async send(input) {
            delivered.push({ challengeId: input.challengeId, email: input.email, otp: input.otp });
            return { providerMessageId: `test-${input.challengeId}` };
          }
        },
        generateOtp: () => "654321",
        hashKey: "test-mfa-otp-hash-key-2026"
      })
    );

    const passwordStep = await auth.login({
      email: "service-admin@example.com",
      password: "correct-password"
    });
    assert.equal(passwordStep.partial, true);
    assert.equal(delivered.length, 1);
    assert.equal(delivered[0]?.otp, "654321");

    const arbitraryOtp = await auth.login({
      email: "service-admin@example.com",
      mfaChallengeId: "mfaChallengeId" in passwordStep.data ? passwordStep.data.mfaChallengeId : undefined,
      otp: "000000",
      password: "correct-password"
    });
    assert.equal(arbitraryOtp.status, "invalid");
    assert.equal(arbitraryOtp.error?.code, "mfa_otp_invalid");
    assert.equal(arbitraryOtp.data.authenticated, false);

    const verified = await auth.login({
      email: "service-admin@example.com",
      mfaChallengeId: "mfaChallengeId" in passwordStep.data ? passwordStep.data.mfaChallengeId : undefined,
      otp: delivered[0]?.otp,
      password: "correct-password"
    });
    assert.equal(verified.status, "ok");
    assert.equal(verified.data.authenticated, true);
  });

  it("stores only a hash, rejects a wrong OTP hash, and consumes the challenge once", async () => {
    const repository = IdentityRepository.inMemory();
    const correctOtpHash = `hmac-sha256:${"a".repeat(64)}`;
    const wrongOtpHash = `hmac-sha256:${"b".repeat(64)}`;
    const challenge = await repository.createMfaChallenge({
      email: "operator@example.com",
      otpHash: correctOtpHash
    });

    assert.equal(challenge.otpHash, correctOtpHash);
    assert.equal(challenge.attempts, 0);
    assert.equal(challenge.maxAttempts, 5);
    assert.doesNotMatch(JSON.stringify(challenge), /654321/);

    const wrong = await repository.consumeMfaChallenge({
      challengeId: challenge.id,
      email: challenge.email,
      otpHash: wrongOtpHash
    });
    assert.deepEqual(wrong, {
      code: "mfa_otp_invalid",
      message: "MFA one-time code is invalid.",
      valid: false
    });

    const afterWrong = await repository.findMfaChallenge(challenge.id);
    assert.equal(afterWrong?.attempts, 1);
    assert.equal(afterWrong?.consumedAt, null);

    const accepted = await repository.consumeMfaChallenge({
      challengeId: challenge.id,
      email: challenge.email,
      otpHash: correctOtpHash
    });
    assert.equal(accepted.valid, true);

    const replay = await repository.consumeMfaChallenge({
      challengeId: challenge.id,
      email: challenge.email,
      otpHash: correctOtpHash
    });
    assert.equal(replay.valid, false);
    assert.equal(replay.code, "mfa_challenge_consumed");
  });

  it("locks a challenge after five invalid OTP attempts", async () => {
    const repository = IdentityRepository.inMemory();
    const challenge = await repository.createMfaChallenge({
      email: "operator@example.com",
      otpHash: `hmac-sha256:${"c".repeat(64)}`
    });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await repository.consumeMfaChallenge({
        challengeId: challenge.id,
        email: challenge.email,
        otpHash: `hmac-sha256:${String(attempt).repeat(64)}`
      });
    }

    const locked = await repository.consumeMfaChallenge({
      challengeId: challenge.id,
      email: challenge.email,
      otpHash: challenge.otpHash
    });
    assert.deepEqual(locked, {
      code: "mfa_challenge_attempts_exceeded",
      message: "MFA challenge has exceeded the allowed verification attempts.",
      valid: false
    });
  });

  it("persists OTP hash and attempt limits in a forward migration", () => {
    const schema = readFileSync(join(backendRoot, "prisma/schema.prisma"), "utf8");
    const migration = readFileSync(
      join(backendRoot, "prisma/migrations/202607100002_mfa_otp_verification/migration.sql"),
      "utf8"
    );

    assert.match(schema, /model MfaChallenge[\s\S]*otpHash\s+String\s+@map\("otp_hash"\)/);
    assert.match(schema, /model MfaChallenge[\s\S]*attempts\s+Int\s+@default\(0\)/);
    assert.match(schema, /model MfaChallenge[\s\S]*maxAttempts\s+Int\s+@default\(5\)/);
    assert.match(migration, /ADD COLUMN\s+"otp_hash"\s+TEXT NOT NULL DEFAULT ''/i);
    assert.match(migration, /ADD COLUMN\s+"attempts"\s+INTEGER NOT NULL DEFAULT 0/i);
    assert.match(migration, /ADD COLUMN\s+"max_attempts"\s+INTEGER NOT NULL DEFAULT 5/i);
  });
});
