ALTER TABLE "marketing_settings"
  ADD COLUMN "request_consent_enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "allow_without_consent" BOOLEAN NOT NULL DEFAULT false;
