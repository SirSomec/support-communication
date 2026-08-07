# RUVDS Borg restore test — 2026-08-08

Result: **passed**.

- Repository: encrypted Borg repository on the OpenMediaVault-managed `/dev/sda1` disk.
- Tested archive: `mail.supportcom.ru-2026-08-08T00:04:19`.
- Repository integrity: `borg check --verify-data` passed.
- Extracted recovery-set checksums: all files passed SHA-256 verification.
- PostgreSQL: the custom-format dump was restored into an isolated PostgreSQL 16
  container with no published ports; the restored database contained 166 public
  tables and 158 Prisma migrations.
- MinIO: four objects were restored into an isolated MinIO container and the restored
  object count matched the recovery set.
- Uptime Kuma: the extracted SQLite database returned `ok` from
  `PRAGMA integrity_check`.
- Production services and data were not modified. All temporary restore containers
  and extracted files were removed after the test.

The follow-up incremental backup also passed after OpenMediaVault-side repository
maintenance. It added only about 2.68 MB of unique data for a 205 MB logical archive,
confirming that remote append-only access and deduplication remained operational.
