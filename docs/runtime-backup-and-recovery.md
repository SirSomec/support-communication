# Runtime backup and recovery

## Policy

- Owner: platform/service administrator.
- PostgreSQL and MinIO are one recovery set and must be copied in the same backup run.
- Target RPO: 24 hours with a daily scheduled `npm run backup:runtime`.
- Target RTO: 60 minutes after infrastructure is available.
- Retain at least 7 daily and 4 weekly copies outside the Docker host.

## Backup

Run from the repository root while the production-like compose stack is healthy:

```powershell
npm run health:compose
npm run backup:runtime -- D:\support-backups\YYYY-MM-DD
```

The directory contains `postgres.dump`, the mirrored MinIO objects and `manifest.json` with SHA-256 checksums. Configure the operating-system scheduler to run this command daily and copy the completed directory to independent storage.

## Restore drill

```powershell
npm run restore-drill:runtime -- D:\support-backups\YYYY-MM-DD
```

The drill validates every checksum, restores PostgreSQL into a temporary database, restores MinIO into a temporary bucket, verifies both, and removes the temporary resources. It does not overwrite the running product. Run after every database migration and at least monthly.

## Full recovery

1. Start clean PostgreSQL and MinIO services with the same major versions as compose.
2. Validate the selected copy with `restore-drill:runtime`.
3. Restore `postgres.dump` with `pg_restore --no-owner --no-privileges` into `support_communication`.
4. Mirror the backup `minio` directory into `support-communication-local` using `mc mirror`.
5. Run Prisma migration deploy, then rebuild and start all application containers.
6. Run `npm run health:compose`, `npm run test:pilot-smoke`, report export/download smoke and role acceptance.

Never restore over a running database. Preserve the failed environment until the incident owner confirms that audit evidence and recovery artifacts are no longer needed.
