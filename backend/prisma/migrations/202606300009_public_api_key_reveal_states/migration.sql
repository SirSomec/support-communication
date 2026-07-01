CREATE TABLE "public_api_key_reveal_states" (
  "key_id" TEXT NOT NULL,
  "key_preview" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "consumed_at" TIMESTAMPTZ(3),

  CONSTRAINT "public_api_key_reveal_states_pkey" PRIMARY KEY ("key_id"),
  CONSTRAINT "public_api_key_reveal_states_status_check" CHECK ("status" IN ('available', 'consumed')),
  CONSTRAINT "public_api_key_reveal_states_key_id_fk" FOREIGN KEY ("key_id") REFERENCES "public_api_keys"("key_id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "public_api_key_reveal_states_status_created_idx" ON "public_api_key_reveal_states"("status", "created_at");
CREATE INDEX "public_api_key_reveal_states_consumed_at_idx" ON "public_api_key_reveal_states"("consumed_at");
