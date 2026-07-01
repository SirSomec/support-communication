CREATE TABLE "service_admin_token_pairs" (
  "id" TEXT NOT NULL,
  "session_id" TEXT NOT NULL,
  "subject_id" TEXT NOT NULL,
  "access_token_hash" TEXT NOT NULL,
  "refresh_token_hash" TEXT NOT NULL,
  "issued_at" TIMESTAMPTZ(3) NOT NULL,
  "access_token_expires_at" TIMESTAMPTZ(3) NOT NULL,
  "refresh_token_expires_at" TIMESTAMPTZ(3) NOT NULL,
  "rotated_at" TIMESTAMPTZ(3),
  "revoked_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "service_admin_token_pairs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "service_admin_token_pairs_distinct_hashes_check" CHECK ("access_token_hash" <> "refresh_token_hash"),
  CONSTRAINT "service_admin_token_pairs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "service_admin_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "service_admin_token_pairs_access_hash_key" ON "service_admin_token_pairs"("access_token_hash");
CREATE UNIQUE INDEX "service_admin_token_pairs_refresh_hash_key" ON "service_admin_token_pairs"("refresh_token_hash");
CREATE INDEX "service_admin_token_pairs_session_active_idx" ON "service_admin_token_pairs"("session_id", "revoked_at", "rotated_at");
CREATE INDEX "service_admin_token_pairs_subject_issued_idx" ON "service_admin_token_pairs"("subject_id", "issued_at");

CREATE TABLE "service_admin_token_rotations" (
  "idempotency_key" TEXT NOT NULL,
  "previous_token_pair_id" TEXT NOT NULL,
  "next_token_pair_id" TEXT NOT NULL,
  "rotated_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "service_admin_token_rotations_pkey" PRIMARY KEY ("idempotency_key"),
  CONSTRAINT "service_admin_token_rotations_previous_pair_fkey" FOREIGN KEY ("previous_token_pair_id") REFERENCES "service_admin_token_pairs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "service_admin_token_rotations_next_pair_fkey" FOREIGN KEY ("next_token_pair_id") REFERENCES "service_admin_token_pairs"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "service_admin_token_rotations_next_pair_key" ON "service_admin_token_rotations"("next_token_pair_id");
CREATE INDEX "service_admin_token_rotations_previous_pair_idx" ON "service_admin_token_rotations"("previous_token_pair_id", "rotated_at");

CREATE TABLE "service_admin_token_revocations" (
  "idempotency_key" TEXT NOT NULL,
  "token_pair_id" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "revoked_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "service_admin_token_revocations_pkey" PRIMARY KEY ("idempotency_key"),
  CONSTRAINT "service_admin_token_revocations_token_pair_id_fkey" FOREIGN KEY ("token_pair_id") REFERENCES "service_admin_token_pairs"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "service_admin_token_revocations_pair_idx" ON "service_admin_token_revocations"("token_pair_id", "revoked_at");
