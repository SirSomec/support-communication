CREATE TABLE "password_credentials" (
  "id" TEXT NOT NULL,
  "subject_id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "hash_algorithm" TEXT NOT NULL,
  "password_hash" TEXT NOT NULL,
  "hash_version" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "password_credentials_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "password_credentials_email_key" ON "password_credentials"("email");
CREATE INDEX "password_credentials_subject_id_updated_at_idx" ON "password_credentials"("subject_id", "updated_at");

CREATE TABLE "password_policies" (
  "id" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "min_length" INTEGER NOT NULL,
  "require_mfa" BOOLEAN NOT NULL DEFAULT true,
  "max_failed_attempts" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "password_policies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "password_policies_scope_key" ON "password_policies"("scope");

CREATE TABLE "credential_audit_events" (
  "id" TEXT NOT NULL,
  "subject_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "actor" TEXT NOT NULL,
  "at" TIMESTAMPTZ(3) NOT NULL,
  "immutable" BOOLEAN NOT NULL DEFAULT true,
  "reason" TEXT NOT NULL,
  "result" TEXT NOT NULL,
  "trace_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "credential_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "credential_audit_events_subject_id_at_idx" ON "credential_audit_events"("subject_id", "at");
CREATE INDEX "credential_audit_events_action_at_idx" ON "credential_audit_events"("action", "at");
