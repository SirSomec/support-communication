-- AI connections move from the JSON store to Postgres (prisma-only runtime
-- plan 2026-07-15, phase A1). The encrypted secret is an AES-256-GCM envelope
-- (ciphertext + iv + auth tag + key/algorithm metadata); the original table
-- only had a single ciphertext column.
ALTER TABLE "ai_connections"
ADD COLUMN "secret_iv" TEXT,
ADD COLUMN "secret_auth_tag" TEXT,
ADD COLUMN "secret_algorithm" TEXT,
ADD COLUMN "secret_envelope_version" INTEGER;
