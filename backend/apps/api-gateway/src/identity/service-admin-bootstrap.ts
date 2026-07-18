import { createHash } from "node:crypto";
import { writeStructuredLog } from "@support-communication/observability";
import { hashPasswordCredential, IdentityRepository } from "./identity.repository.js";

// Первичная учётная запись администратора сервиса задаётся через env
// (BOOTSTRAP_SERVICE_ADMIN_EMAIL / BOOTSTRAP_SERVICE_ADMIN_PASSWORD) и
// создаётся при старте гейтвея. Семантика create-if-absent: рестарты не
// перетирают пароль, сменённый после первого входа. Явная мисконфигурация
// (неполная пара, короткий пароль, занятый email) роняет старт — fail-closed,
// как и остальные бутстрап-проверки в main.ts.

/** Минимальная длина совпадает с посевной политикой scope=service-admin. */
const MIN_SERVICE_ADMIN_PASSWORD_LENGTH = 12;

export interface ServiceAdminBootstrapResult {
  outcome: "created" | "exists" | "skipped";
  subjectId?: string;
}

export async function bootstrapServiceAdminFromEnv(
  source: NodeJS.ProcessEnv = process.env,
  repository: IdentityRepository = IdentityRepository.default()
): Promise<ServiceAdminBootstrapResult> {
  const email = String(source.BOOTSTRAP_SERVICE_ADMIN_EMAIL ?? "").trim().toLowerCase();
  const password = String(source.BOOTSTRAP_SERVICE_ADMIN_PASSWORD ?? "");

  if (!email && !password) {
    return { outcome: "skipped" };
  }
  if (!email || !password) {
    throw new Error("bootstrap_service_admin_config_incomplete");
  }
  if (email.length > 254 || !/^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(email)) {
    throw new Error("bootstrap_service_admin_email_invalid");
  }
  if (password.length < MIN_SERVICE_ADMIN_PASSWORD_LENGTH) {
    throw new Error("bootstrap_service_admin_password_too_short");
  }

  // Логин сервис-админа отклоняется, если email принадлежит тенант-пользователю
  // (auth.service: service_admin_subject_required) — такая конфигурация мертва
  // с самого начала, сообщаем об этом на старте.
  const tenantUser = await repository.findTenantUserByEmail(email);
  if (tenantUser) {
    throw new Error("bootstrap_service_admin_email_belongs_to_tenant_user");
  }

  const subjectId = serviceAdminSubjectId(email);
  const existing = await repository.findPasswordCredentialByEmail(email);
  if (existing) {
    if (!existing.subjectId.startsWith("svc-admin")) {
      throw new Error("bootstrap_service_admin_email_conflict");
    }
    writeStructuredLog("info", "Service admin bootstrap: credential already exists", {
      operation: "bootstrapServiceAdmin",
      outcome: "exists",
      service: "identity",
      subjectId: existing.subjectId
    });
    return { outcome: "exists", subjectId: existing.subjectId };
  }

  await repository.savePasswordCredential({
    algorithm: "scrypt",
    email,
    hash: hashPasswordCredential(password),
    subjectId,
    updatedAt: new Date().toISOString(),
    version: 1
  });
  writeStructuredLog("info", "Service admin bootstrap: credential created", {
    operation: "bootstrapServiceAdmin",
    outcome: "created",
    service: "identity",
    subjectId
  });
  return { outcome: "created", subjectId };
}

/** Детерминированный субъект: обязан начинаться с "svc-admin" (проверка логина). */
function serviceAdminSubjectId(email: string): string {
  return `svc-admin-${createHash("sha256").update(email).digest("hex").slice(0, 12)}`;
}
