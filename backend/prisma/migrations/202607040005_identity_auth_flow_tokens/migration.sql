CREATE TABLE "auth_invite_tokens" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_invite_tokens_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "auth_recovery_tokens" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_recovery_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "auth_invite_tokens_code_hash_key" ON "auth_invite_tokens"("code_hash");
CREATE INDEX "auth_invite_tokens_email_expires_at_idx" ON "auth_invite_tokens"("email", "expires_at");
CREATE INDEX "auth_invite_tokens_expiry_consumed_idx" ON "auth_invite_tokens"("expires_at", "consumed_at");
CREATE INDEX "auth_invite_tokens_tenant_expires_at_idx" ON "auth_invite_tokens"("tenant_id", "expires_at");

CREATE UNIQUE INDEX "auth_recovery_tokens_token_hash_key" ON "auth_recovery_tokens"("token_hash");
CREATE INDEX "auth_recovery_tokens_email_expires_at_idx" ON "auth_recovery_tokens"("email", "expires_at");
CREATE INDEX "auth_recovery_tokens_expiry_consumed_idx" ON "auth_recovery_tokens"("expires_at", "consumed_at");
