# Security & privacy review: Bots / AI agent (BAI-705)

Дата: 2026-07-12  
Область: URL/document/MCP sources, AI connections/secrets, prompt grounding, tenant isolation, retention.

Связанные артефакты: [operations runbook](bots-ai-operations-runbook.md), [BAI-307 security contracts](../backend/tests/bai-307-ai-connection-security-contracts.test.ts), [BAI-006 negative contracts](../backend/tests/bai-006-negative-contracts.test.ts).

## Threat model

| Угроза | Контроль | Статус |
| --- | --- | --- |
| SSRF / private IP via URL source | Allowlist, redirect deny, private-IP block, size/timeout caps | Covered in knowledge URL config tests |
| MCP write / unsafe tool | Read-only connectors, approval workflow, rate limit, disable path | Covered in MCP admin contracts |
| Secret leakage (API keys) | SecretStore encryption, masked responses, no key in logs/audit | Covered in BAI-307 |
| Prompt injection via retrieved text | Grounded prompt + citations; no CRM write tools; handoff on low confidence | Covered in Gate F / AI bot response |
| Cross-tenant scenario / source / feedback | TenantId on every write; fail-closed foreign access | Covered in BAI-006 + BAI-703 |
| Provider abuse / cost spike | RPM, concurrency, monthly budget, kill switch | Covered in usage repository + alerts |
| Log PII explosion | Metrics label sanitization; redacted handoff/runtime errors | Covered in BAI-700 + redaction package |

## Least privilege

- Service Admin: AI connections, secrets, budgets, connection kill switch.
- Tenant admin: scenarios, sources, phrases, publish/pause — never raw API keys.
- Operator: handoff view + feedback (`helped` / `not_helped` / `wrong_source`) — feedback does not mutate knowledge.
- Platform ops: workers, DLQ, ingestion — no tenant secret read.

## Retention / deletion

- Archived scenarios: retention window + legal/audit hold (no purge while held).
- Feedback: append-only, tenant-scoped; wrong_source queues review without auto-edit.
- AI usage: aggregate token/cost metadata only; no raw prompts with secrets.
- Runtime journal: redacted `lastError`; dead-letter replay is idempotent.

## Dependency / log review checklist

1. Scan AI provider SDK and MCP client dependencies for known CVEs before pilot expand.
2. Confirm production log shippers drop Authorization / `apiKey` / `sk-` patterns.
3. Confirm metrics/dashboards use `sanitizeMetricLabel` and never attach message bodies.
4. Confirm feature flag `ai_agents_v1` kill switch and scenario/connection/source disable paths are rehearsed.

## Residual risks

- Prompt injection remains residual; mitigate with source allowlist + operator handoff + no write tools.
- Third-party provider outage handled by fallback/handoff; customer SLA depends on kill-switch speed.
