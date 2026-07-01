CREATE TABLE "signed_webhook_replay_nonces" (
  "endpoint_id" TEXT NOT NULL,
  "nonce" TEXT NOT NULL,
  "first_seen_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "signed_webhook_replay_nonces_pkey" PRIMARY KEY ("endpoint_id", "nonce")
);

CREATE INDEX "signed_webhook_replay_nonces_endpoint_first_seen_idx" ON "signed_webhook_replay_nonces"("endpoint_id", "first_seen_at");
