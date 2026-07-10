ALTER TABLE "telegram_connections"
ADD COLUMN "polling_offset" INTEGER NOT NULL DEFAULT 0;
