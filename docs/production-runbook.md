# Production deployment runbook

## Scope

This runbook deploys the application services to one Docker Compose host while PostgreSQL, Redis, object storage and SMTP are supplied as protected production services. It deliberately does not start local PostgreSQL, Redis, MinIO, Mailpit or demo bootstrap data.

## Prerequisites

- Linux host with current Docker Engine and Docker Compose v2.
- Public DNS `A`/`AAAA` record for the application host.
- Inbound firewall access only to TCP `80`, TCP `443` and UDP `443`.
- Private or TLS-protected PostgreSQL, Redis, S3-compatible storage and SMTP.
- GHCR or another registry containing the frontend, API and migration images for the same commit SHA.
- An off-host backup destination and a named on-call owner.

## Prepare configuration

1. Copy `deploy/env/production.env.example` to a protected path such as `/etc/support-communication/production.env`.
2. Restrict it to the deployment account: `chmod 600`.
3. Replace every `REQUIRED` and `example.*` value.
4. Generate independent secrets. The two encryption master keys must each be canonical base64 for exactly 32 random bytes.
5. Use image references tagged with the deployed commit (`sha-<commit>`) or pinned by digest.
6. Run the fail-closed check:

   ```bash
   npm run production:config:check -- /etc/support-communication/production.env
   ```

The preflight rejects placeholder values, local credentials, mutable image tags, insecure Redis/S3 URLs, malformed CORS origins and invalid master keys. It never prints secret values.

## Initial deployment

1. Confirm that a fresh database backup exists when deploying into an existing environment.
2. Pull the release images:

   ```bash
   docker compose --env-file /etc/support-communication/production.env -f deploy/compose/compose.production.yml pull
   ```

3. Apply database migrations as a one-shot release job:

   ```bash
   docker compose --env-file /etc/support-communication/production.env -f deploy/compose/compose.production.yml --profile release run --rm migrate
   ```

4. Start the runtime:

   ```bash
   docker compose --env-file /etc/support-communication/production.env -f deploy/compose/compose.production.yml up -d --remove-orphans
   ```

5. Verify HTTPS, readiness, login, MFA delivery, widget messaging, file scan and enabled provider channels.

## First service administrator

The local `bootstrap` service must never be run in production. Supply `BOOTSTRAP_SERVICE_ADMIN_EMAIL` and `BOOTSTRAP_SERVICE_ADMIN_PASSWORD` only for the controlled first API start, confirm creation in the immutable audit trail, then remove both variables and recreate the API container. Rotate the one-time password immediately. If an administrator already exists, leave both values unset.

## Metrics and logs

The API exposes Prometheus text internally at `/api/v1/metrics`. The public Caddy edge deliberately returns `404` for this path. A monitoring collector must scrape the API over the Docker network or another authenticated private path. Containers use bounded JSON-file logs; the host log collector should forward them to centralized storage with retention and secret-redaction rules.

## Scheduled backups

Install PostgreSQL client tools and MinIO Client (`mc`) on the host, then install the supplied systemd units from `deploy/systemd/`. The backup job creates a custom-format PostgreSQL dump, mirrors the production object bucket, writes SHA-256 checksums and optionally mirrors the complete recovery set to an independent S3-compatible destination.

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now support-communication-backup.timer
sudo systemctl start support-communication-backup.service
sudo journalctl -u support-communication-backup.service
```

The offsite bucket must enforce encryption, versioning or object lock, retention and credentials that cannot mutate the production source bucket. Schedule a restore drill at least monthly and after database migrations.

## Update procedure

1. Run CI and staging acceptance for the target commit.
2. Update all three image references to the same commit SHA.
3. Run `production:config:check`.
4. Create and verify a pre-release backup.
5. Pull images and run the migration job.
6. Recreate services with `docker compose up -d --remove-orphans`.
7. Run readiness and product smoke tests before closing the release window.

## Rollback

- Application rollback: restore the previous immutable image references and recreate services.
- Database rollback: use only a migration-specific, pre-tested rollback procedure. Never automatically reverse a destructive migration.
- If database compatibility is uncertain, stop the rollout, preserve logs and restore into an isolated database before making a recovery decision.

## External work still required

- Select actual DNS, registry, PostgreSQL, Redis, S3 and SMTP providers.
- Configure S3 bucket encryption, lifecycle, CORS and IAM policies.
- Configure SPF, DKIM and DMARC for the production sender domain.
- Store the real environment in a secrets manager or protected host file.
- Configure off-host immutable backups, monitoring, alert routing and on-call contacts.
- Perform live acceptance for every enabled provider and an external penetration test.
