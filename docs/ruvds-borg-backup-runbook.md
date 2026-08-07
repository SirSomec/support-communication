# RUVDS off-site backup runbook

## Deployed design

- The RUVDS host creates one encrypted Borg archive every day at 03:15 Europe/Moscow.
- The repository is stored on the OpenMediaVault-managed `/dev/sda1` filesystem at
  `/srv/dev-disk-by-uuid-76a709c8-bc1b-431c-bf6b-83d7ccc3e53d/ruvds-backups/repository`.
- The VPS SSH key is restricted to `borg serve --append-only`, so it cannot prune or
  overwrite old archives. Repository maintenance runs locally on the Raspberry Pi.
- Retention is 14 daily, 8 weekly, 12 monthly and 3 yearly archives.
- OpenMediaVault Scheduled Jobs run retention daily, a full repository verification
  weekly, and a recovery-set extraction/validation monthly.

The recovery set includes logical PostgreSQL dumps (including global roles), a Redis
snapshot, a logical MinIO mirror, an online Uptime Kuma SQLite backup, mail data,
application configuration and secrets, relevant Docker volumes, `/etc`, and the root
SSH configuration. ClamAV definitions, Netdata cache, mail logs and temporary E2E
volumes are excluded because they are reproducible or non-production data.

## Routine checks

On RUVDS:

```bash
systemctl list-timers ruvds-borg-backup.timer
systemctl status ruvds-borg-backup.service
journalctl -u ruvds-borg-backup.service --since yesterday
cat /var/lib/ruvds-backup/last-success
```

On Raspberry Pi / OpenMediaVault:

```bash
sudo cat /var/lib/ruvds-borg/last-maintenance-success
sudo cat /var/lib/ruvds-borg/last-check-success
sudo cat /var/lib/ruvds-borg/last-restore-validation
sudo cat /var/lib/ruvds-borg/last-live-restore-test
sudo /usr/local/sbin/ruvds-borg-restore-validate
```

Use the installed maintenance scripts for local repository operations; they restore
repository ownership required by the append-only SSH user. Do not run ad-hoc Borg
write or maintenance commands as root, and do not copy the passphrase into the shared
folder.

## Full recovery outline

1. Preserve the failed VPS and choose a validated archive.
2. On a clean replacement host, install Borg and Docker, then extract the archive.
3. Restore `/opt`, `/etc` and the required named-volume data with services stopped.
4. Create PostgreSQL roles from `globals.sql`, then restore
   `support_communication.dump` with `pg_restore --no-owner --no-privileges`.
5. Restore MinIO objects with `mc mirror`, or use the raw volume only while MinIO is
   stopped and is on the same version.
6. Restore the Redis snapshot and Uptime Kuma database while their containers are
   stopped, start the compose projects, then run application health and login tests.

Never restore a database or Docker volume over a running production service.
