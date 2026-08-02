# Runtime backup and recovery

> **Статус на 2026-07-28 (аудит инфраструктуры): ПРОЦЕДУРЫ НИЖЕ НЕ РАЗВЁРНУТЫ. Резервных копий данных продукта на проде НЕТ вообще — фактический RPO = ∞.**
>
> - systemd-юниты бэкапа (`deploy/systemd/support-communication-backup.{service,timer}`) на прод-сервере (Raspberry Pi, `supportcom.ru`) **не установлены**; `pg_dump`, `mc mirror` и offsite-копирование **не выполняются**;
> - расписанного `npm run backup:runtime` и `restore-drill:runtime` на сервере нет; ни один restore drill не проводился;
> - **алерта на пропущенный бэкап нет** — провал резервного копирования никем не замечается (postfix/monit/OMV-почта выключены, внешнего мониторинга нет);
> - при потере данных на текущем сервере восстановление невозможно.
>
> Ниже описана **целевая (target)** политика и процедуры. Их необходимо реально развернуть и проверить, прежде чем считать данные продукта защищёнными. Полный отчёт: [`infrastructure-audit-2026-07-28.md`](infrastructure-audit-2026-07-28.md), раздел 4 «Бэкапы».

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
