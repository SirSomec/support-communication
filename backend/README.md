# Support Communication Backend

Phase 0 contains the backend monorepo foundation: shared envelope, config validation, observability helpers, local infrastructure and a bootable API Gateway with health/readiness/OpenAPI shell.

## Commands

```bash
npm install
npm run typecheck
npm test
npm run build
npm run prisma:validate
npm run prisma:generate
npm run prisma:seed
npm run identity:bootstrap:postgres
npm run tenant-isolation:verify
npm run audit-immutability:verify
npm run public-api:docs:verify
npm run public-api:docs:runtime-smoke
npm run smoke:postgres
npm run release:checklist
npm run start:api-gateway
npm run outbox:worker:once
npm run billing:worker:once
npm run start:outbox-bullmq-worker
npm run start:billing-bullmq-worker
```

`start:api-gateway` loads `.env.example` through Node's `--env-file` flag for local smoke runs. For real environments, pass environment variables through the deployment platform instead of using `.env.example`. Identity, billing, conversation and workspace persistence default to JSON stores; set `IDENTITY_REPOSITORY=prisma`, `BILLING_REPOSITORY=prisma`, `CONVERSATION_REPOSITORY=prisma` and/or `WORKSPACE_REPOSITORY=prisma` with `DATABASE_URL` to use the Prisma-backed repository adapters that are available for the current slices. The current workspace Prisma adapter stores file metadata, antivirus scan-result metadata and scan-result callback idempotency records in PostgreSQL and keeps client/template/knowledge state on the configured `WORKSPACE_STORE_FILE` JSON fallback until those tables are implemented. File upload and download policy descriptors use a server-side object storage signer: local tests fall back to `storage.local`, while runtime S3/MinIO config (`S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`) produces SigV4 presigned URLs over opaque object keys, without returning tenant/file-name-derived raw `objectKey` fields in API responses. The files API exposes a guarded scan-result ingress that records `clean`, `infected` or `error` verdicts, keeps downloads fail-closed until clean results, returns `file_scan_blocked` for blocked files and replays scanner callbacks by `idempotency-key`.

`prisma:validate`, `prisma:generate`, `prisma:migrate:deploy`, `prisma:seed`, `identity:bootstrap:postgres`, `smoke:postgres` and `release:checklist` also load `.env.example` for local defaults. The Prisma schema covers the identity foundation, tenant metadata preservation, tenant users, permission roles, service-admin audit rows, service-admin impersonation/break-glass state, billing tenant state, billing-sync job descriptors, idempotent billing quota ledger entries, conversation state, workspace file metadata, workspace file scan results, scan callback idempotency and transactional outbox tables. `prisma:seed` idempotently seeds tenant rows, tenant users, permission roles, billing tenant states and baseline tenant audit events while preserving live tenant status/custom metadata, live user state and live billing tariff/usage state. Prisma tenant reads normalize sparse metadata, unsupported statuses and string-array fields before returning the API read model. Confirmed service-admin user actions persist tenant user mutations and immutable audit rows through the identity repository; confirmed service-admin impersonation/break-glass state persists through the identity repository, including approve/reject/expire decision audit rows and approval-bound `break_glass_write` impersonation sessions linked by `approval_id`; confirmed billing tariff changes persist billing tenant state and pending `billing-sync` descriptors through the billing repository. Legacy quota checks remain read-only; explicit quota `record` checks require an idempotency key and persist allow/deny ledger entries across JSON and Prisma billing repositories. The outbox worker app can run bounded PostgreSQL-backed batches with `outbox:worker:once` and `billing:worker:once`, includes durable retry backoff/dead-letter state, atomic dead-letter replay transitions guarded by queue ownership, uses default handler registries for known identity/billing descriptors and can be driven through BullMQ bridge mode with `start:outbox-bullmq-worker` or `start:billing-bullmq-worker`. Unknown event types fail closed instead of being silently published. File-scan descriptors now carry `fileId` through the scanner dispatch request so scanner callbacks can target `/files/:fileId/scan-result`; actual scanner execution and full antivirus callback delivery are still follow-up work. `tenant-isolation:verify` runs the tenant isolation verifier contracts for tenant-owned repository/API gates. `audit-immutability:verify` runs immutable audit verifier contracts for privileged mutations, replay paths and durable audit evidence. `redaction:runtime-smoke` runs bootstrap/config, provider, scanner and export descriptor redaction smoke fixtures. `smoke:postgres` runs migration deploy and the identity seed as one PostgreSQL smoke command. `release:checklist` runs the release verification checklist: `npm run prisma:validate` for schema validation, `npm run prisma:migrate:deploy` for migrations, `npm run prisma:seed` for seed data, `npm run tenant-isolation:verify` for tenant isolation gates, `npm run audit-immutability:verify` for immutable audit gates, `npm run migration-rollback-check:verify` for migration rollback-check tooling gates, `npm run redaction:runtime-smoke` for secret redaction runtime smoke, `npm run outbox:worker:once` and `npm run billing:worker:once` for worker smoke coverage. Full service repositories, downstream domain handlers and service-specific BullMQ workers are still follow-up work.

## Local Infrastructure

```bash
docker compose -f docker/docker-compose.yml up -d
```

The compose file starts PostgreSQL, Redis, MinIO and Mailpit for local development. Domain service persistence is being added incrementally behind the API Gateway contract slices.
