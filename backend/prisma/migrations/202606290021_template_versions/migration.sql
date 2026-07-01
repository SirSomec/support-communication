CREATE TABLE "template_versions" (
  "id" TEXT NOT NULL,
  "template_id" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "topic" TEXT NOT NULL,
  "usage" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "template_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "template_versions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "template_records"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "template_versions_template_id_version_key" ON "template_versions"("template_id", "version");
CREATE INDEX "template_versions_template_id_version_idx" ON "template_versions"("template_id", "version");
