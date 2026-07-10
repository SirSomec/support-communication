# Report Export Worker Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real report export worker runtime that processes queued `report_export_jobs` into persisted `report_file_descriptors` and proves it with a seeded release smoke.

**Architecture:** Keep the first runtime slice narrow: claim queued jobs by queue, write deterministic CSV/JSON/XLSX export objects through the existing object storage port, persist file descriptors, and mark jobs `ready` or `error`. Use a unique smoke queue so release verification cannot race with the long-running compose worker.

**Tech Stack:** Node.js, TypeScript, Prisma-backed `ReportRepository`, existing `report-export.worker.ts` object storage helpers, Docker Compose.

---

### Task 1: Report Export Queue Claim Contract

**Files:**
- Modify: `backend/tests/report-export-worker-contracts.test.ts`
- Modify: `backend/apps/api-gateway/src/reports/report.repository.ts`

- [x] **Step 1: Write the failing test**

Add a contract that seeds one default queued export job and one smoke queued export job, calls a repository claim method with `queue: "report-export-smoke"`, and asserts only the smoke job moves to `running`.

- [x] **Step 2: Run RED**

Run: `cd backend && node --test --import tsx tests\report-export-worker-contracts.test.ts`
Expected: fails because the claim method does not exist.

- [x] **Step 3: Implement minimal repository claim**

Add `claimQueuedExportJobsAsync({ queue, limit, now })` to `ReportRepository`, filtering by `statusKey === "queued"` and `queue`, setting claimed jobs to `running`, `progress: 20`, and preserving normal `report-export` defaults.

- [x] **Step 4: Run GREEN**

Run: `cd backend && node --test --import tsx tests\report-export-worker-contracts.test.ts`
Expected: report export worker contracts pass.

### Task 2: Worker Execution Contract

**Files:**
- Modify: `backend/tests/report-export-worker-contracts.test.ts`
- Modify: `backend/apps/api-gateway/src/reports/report-export.worker.ts`

- [x] **Step 1: Write the failing test**

Add a contract for `executeReportExportWorkerOnce` that claims one job, writes one object, persists a file descriptor, and updates the job to `ready`.

- [x] **Step 2: Run RED**

Run: `cd backend && node --test --import tsx tests\report-export-worker-contracts.test.ts`
Expected: fails because `executeReportExportWorkerOnce` does not exist.

- [x] **Step 3: Implement minimal worker**

Use existing CSV/JSON writers. For `XLSX`, emit a deterministic minimal OpenXML workbook, preserving the requested file extension and content type contract explicitly in tests.

- [x] **Step 4: Run GREEN**

Run: `cd backend && node --test --import tsx tests\report-export-worker-contracts.test.ts`
Expected: report export worker contracts pass.

### Task 3: Runtime Entrypoint And Smoke

**Files:**
- Create: `backend/apps/api-gateway/src/reports/report-export.main.ts`
- Create: `backend/scripts/report-export-worker-smoke.mjs`
- Modify: `backend/package.json`
- Modify: `backend/scripts/release-checklist.mjs`
- Modify: `backend/tests/report-export-worker-contracts.test.ts`

- [x] **Step 1: Write the failing test**

Assert package scripts `start:report-export-worker` and `report-export:worker:once`, smoke script existence, and release checklist wiring.

- [x] **Step 2: Run RED**

Run: `cd backend && node --test --import tsx tests\report-export-worker-contracts.test.ts`
Expected: fails on missing script/entrypoint.

- [x] **Step 3: Implement runtime and smoke**

Runtime loads `ReportRepository`, local filesystem object storage rooted by `REPORT_EXPORT_OBJECT_ROOT`, queue from `REPORT_EXPORT_WORKER_QUEUE`, and `--once`. Smoke seeds one queued XLSX export job on a unique queue, runs once, and asserts `scanned=1`, `ready=1`, `failed=0`, persisted file descriptor, and a stored object file with matching size.

- [x] **Step 4: Run GREEN and release gate**

Run:
- `cd backend && node --test --import tsx tests\report-export-worker-contracts.test.ts`
- `cd backend && npm run report-export:worker:once`
- `cd backend && npm run release:checklist`

Expected: all pass.

### Task 4: Compose Service

**Files:**
- Modify: `docker-compose.yml`
- Modify: `docker-compose.pilot.yml`
- Modify: `backend/tests/report-export-worker-contracts.test.ts`

- [x] **Step 1: Write/adjust compose contract**

Assert `report-export-worker` service exists, depends on `api-gateway`, uses `apps/api-gateway/dist/reports/report-export.main.js`, and pilot mode uses `REPORT_REPOSITORY=prisma`.

- [x] **Step 2: Implement compose service**

Add the worker with `REPORT_EXPORT_WORKER_QUEUE=report-export` and local storage mode for local runtime.

- [x] **Step 3: Verify stack**

Run:
- `docker compose -f docker-compose.yml -f docker-compose.pilot.yml --profile prisma-postgres --profile scanner-runtime up -d --build`
- `node scripts\compose-health-check.mjs`
- `curl.exe -fsS http://127.0.0.1:4101/api/v1/ready`

Expected: stack starts and health checks pass.
