CREATE TABLE "feature_flag_rules" (
    "id" TEXT NOT NULL,
    "flag_id" TEXT NOT NULL,
    "flag_key" TEXT NOT NULL,
    "targeting" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "rollout" INTEGER NOT NULL,
    "bucket_salt" TEXT NOT NULL,
    "segments" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "enabled_tenant_ids" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "variants" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feature_flag_rules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "feature_flag_rules_rollout_check" CHECK ("rollout" >= 0 AND "rollout" <= 100),
    CONSTRAINT "feature_flag_rules_targeting_check" CHECK ("targeting" IN ('tenant', 'segment'))
);

CREATE INDEX "feature_flag_rules_flag_targeting_idx" ON "feature_flag_rules"("flag_id", "targeting");
CREATE INDEX "feature_flag_rules_flag_key_idx" ON "feature_flag_rules"("flag_key");
