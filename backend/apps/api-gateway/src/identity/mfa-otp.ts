import { createHmac, randomInt } from "node:crypto";
import {
  createMfaOtpDeliveryFromEnv,
  type MfaOtpDeliveryPort
} from "./mfa-otp-delivery.js";

export interface MfaOtpIssue {
  otp: string;
  otpHash: string;
}

export interface MfaOtpRuntime {
  deliver(input: {
    challengeId: string;
    email: string;
    expiresAt: string;
    otp: string;
  }): Promise<{ providerMessageId: string }>;
  deliverRecovery(input: {
    email: string;
    expiresAt: string;
    recoveryToken: string;
    requestId: string;
  }): Promise<{ providerMessageId: string }>;
  hash(email: string, otp: string): string;
  issue(email: string): MfaOtpIssue;
}

interface MfaOtpRuntimeOptions {
  delivery: MfaOtpDeliveryPort;
  generateOtp?: () => string;
  hashKey: string;
}

export function createMfaOtpRuntime(options: MfaOtpRuntimeOptions): MfaOtpRuntime {
  const hashKey = options.hashKey.trim();
  if (hashKey.length < 16) {
    throw new Error("MFA OTP hash key must contain at least 16 characters.");
  }

  const hash = (email: string, otp: string) => {
    const digest = createHmac("sha256", hashKey)
      .update(`mfa-otp:v1:${normalizeEmail(email)}:${String(otp).trim()}`)
      .digest("hex");
    return `hmac-sha256:${digest}`;
  };

  return {
    deliver: (input) => options.delivery.send(input),
    deliverRecovery: (input) => {
      if (!options.delivery.sendRecovery) {
        throw new Error("Password recovery delivery is not configured.");
      }
      return options.delivery.sendRecovery(input);
    },
    hash,
    issue(email) {
      const otp = options.generateOtp?.() ?? randomInt(0, 1_000_000).toString().padStart(6, "0");
      if (!/^\d{6}$/.test(otp)) {
        throw new Error("MFA OTP generator must return exactly six digits.");
      }
      return { otp, otpHash: hash(email, otp) };
    }
  };
}

export function createMfaOtpRuntimeFromEnv(source: NodeJS.ProcessEnv = process.env): MfaOtpRuntime {
  const nodeEnv = String(source.NODE_ENV ?? "").trim().toLowerCase();
  if (!["development", "test", "staging", "production"].includes(nodeEnv)) {
    throw new Error("NODE_ENV must be explicitly set before creating the MFA runtime.");
  }
  const localRuntime = nodeEnv === "development" || nodeEnv === "test";
  const deliveryMode = String(source.MFA_OTP_DELIVERY_MODE ?? "").trim().toLowerCase();
  const deterministicDelivery = ["deterministic", "no-op", "noop", "test"].includes(deliveryMode);
  const configuredHashKey = String(source.MFA_OTP_HASH_KEY ?? source.JWT_ACCESS_SECRET ?? "").trim();
  const hashKey = configuredHashKey || (localRuntime ? "local-test-mfa-otp-hash-key" : "");

  if (!hashKey) {
    throw new Error("MFA_OTP_HASH_KEY or JWT_ACCESS_SECRET is required outside development and test.");
  }

  return createMfaOtpRuntime({
    delivery: createMfaOtpDeliveryFromEnv(source),
    generateOtp: nodeEnv === "test" || localRuntime && deterministicDelivery ? () => "123456" : undefined,
    hashKey
  });
}

function normalizeEmail(email: string): string {
  return String(email ?? "").trim().toLowerCase();
}
