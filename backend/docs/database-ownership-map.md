# Database Ownership Map

This document is the source-of-truth map for PostgreSQL table ownership across backend service schemas.

Rules:

- Each PostgreSQL table has exactly one owner service.
- Services do not read another service's tables directly; use explicit APIs, events or read models.
- Shared infrastructure tables are owned by the service that operates the infrastructure contract.
- Rows without current tables define the owner for the next migration slice before tables are added.

| Owner service | Responsibility boundary | Current PostgreSQL tables | Next migration slice |
| --- | --- | --- | --- |
| `api-gateway` | External REST API, request envelope, auth context handoff and operations readiness restore-check result rows | `operations_postgres_restore_check_results`, `operations_object_storage_restore_check_results` | Phase 10 slices 10.2-10.3 for PostgreSQL and object-storage restore-check automation. Prisma tables are schema foundation only; durable runtime persistence currently uses the JSON operations store via `OperationsRepository` until Prisma adapters land. |
| `realtime-gateway` | SSE/WebSocket delivery and multi-instance fan-out | None; current durable realtime events are owned by `conversation-service` | Phase 2 slices 2.4-2.5 for Redis fan-out and multi-instance cursor checks |
| `auth-service` | MFA challenges, service-admin sessions, credential/session lifecycle | `mfa_challenges`, `service_admin_sessions`, `service_admin_token_pairs`, `service_admin_token_rotations`, `service_admin_token_revocations`, `password_credentials`, `password_policies`, `credential_audit_events`, `oidc_provider_configs`, `oidc_callback_descriptors`, `saml_provider_metadata`, `saml_acs_request_descriptors`, `saml_assertion_replays` | Phase 1 slices 1.2-1.4 for token, OIDC and SAML persistence |
| `tenant-service` | Tenant catalog, tenant users, tenant status and tenant audit events | `tenants`, `tenant_users`, `tenant_audit_events` | Phase 0 slice 0.2 for shared repository bootstrap and Phase 1 slice 1.5 for policy-linked tenant reads |
| `rbac-service` | Permission roles, policy versions, role grants and permission denial events | `permission_roles`, `rbac_policy_versions`, `rbac_role_grants`, `permission_denial_events` | Phase 1 slice 1.5 for RBAC policy versions and tenant-scoped permission denials |
| `conversation-service` | Dialog lifecycle, conversation messages, inbound idempotency, outbound descriptors and persisted realtime events | `conversations`, `conversation_messages`, `conversation_inbound_events`, `conversation_outbound_descriptors`, `conversation_realtime_events` | Phase 2 slices 2.1-2.5 for provider receipts and realtime fan-out |
| `message-service` | Message-specific delivery/read state and drafts | `channel_delivery_receipts` | Phase 2 slices 2.3.b-2.3.c for receipt repository adapters and realtime delivery updates |
| `channel-service` | Channel provider configuration, channel capabilities and external delivery state | None; current delivery descriptors are owned by `conversation-service` | Phase 2 slices 2.1-2.2 for provider adapter contracts |
| `client-profile-service` | Client identities, merge graph and profile conflict state | `client_profiles`, `client_merge_events`, `client_merge_conflicts` | Phase 3 slice 3.1 for JSON/Prisma client repository adapters |
| `template-knowledge-service` | Templates, article versions, approval decisions and publication state | `template_records`, `template_versions`, `template_audit_events`, `knowledge_articles`, `knowledge_draft_versions`, `knowledge_approval_decisions` | Phase 3 slice 3.3 for knowledge Prisma tables |
| `routing-sla-service` | Routing rules, assignments, SLA timers, rescue jobs and routing outcomes | `routing_rules`, `queue_memberships`, `operator_capacities`, `routing_analytics_rows` | Phase 4 slices 4.2-4.5 for assignment simulation, SLA/rescue workers and routing analytics tables |
| `report-service` | Metric definitions, report jobs, export files, saved templates and scheduled digests | `metric_definitions`, `metric_versions`, `metric_tenant_overrides`, `saved_report_templates`, `report_export_jobs`, `report_idempotency_keys`; remaining digest state is JSON-backed | Phase 5 slices 5.4-5.5 for remaining digest tables |
| `integration-webhook-service` | Public API keys, webhook verification, delivery journal and replay workers | `public_api_keys`, `public_api_key_reveal_states`, `public_api_key_rotation_audit_events`, `signed_webhook_replay_nonces`, `webhook_delivery_journal`; remaining integration state is JSON-backed | Phase 6 slices 6.4-6.5 for webhook retry journal workers and docs |
| `file-service` | Upload metadata, scan state, scan callback idempotency and object storage policy | `workspace_files`, `workspace_file_scan_result_idempotency` | Phase 3 slices 3.4-3.6 for storage verification, scanner worker and attachment limits |
| `automation-bot-service` | Bot scenarios, runtime versions, proactive execution and bot handoff events | `bot_scenarios`, `bot_scenario_versions`, `bot_publish_audit_events`, `proactive_execution_windows`, `proactive_frequency_caps`, `proactive_experiment_assignments`; remaining automation state is JSON-backed | Phase 7 slices 7.3-7.4 for remaining proactive and runtime worker tables |
| `quality-ai-service` | Quality ratings, manual QA reviews and AI scoring telemetry | `quality_ratings`, `manual_qa_reviews`, `ai_scoring_audits`; remaining quality state is JSON-backed | Phase 7 slices 7.5-7.6 for scoring adapter telemetry and quality review tables |
| `billing-service` | Billing tenant state, quota ledger/reservations, subscriptions, invoices, provider sync jobs, payment retry schedules, dunning state, reconciliation conflicts, retry keys and approval workflow state | `billing_tenant_states`, `billing_sync_jobs`, `billing_quota_ledger_entries`, `billing_quota_reservations`, `billing_subscriptions`, `billing_invoices`, `billing_provider_sync_events`, `billing_payment_retry_schedules`, `billing_payment_dunning_states`, `billing_reconciliation_conflicts`, `billing_payment_retry_keys`, `billing_approvals`, `billing_legal_entities`, `billing_tax_documents` | Phase 8 slice 8.2 for billing approval, legal entity and tax document persistence |
| `audit-service` | Immutable audit journal, redaction overlays and audit exports | None; current audit-like rows stay with their producing services until the audit service owns the cross-domain journal | Phase 10 slice 10.7 for audit immutability gates |
| `platform-admin-service` | Service-admin audit, impersonation and break-glass approvals | `service_admin_audit_events`, `service_admin_impersonations`, `break_glass_approvals` | Phase 1 slice 1.5 and Phase 10 slices 10.6-10.8 for cross-surface hardening |
| `platform-monitoring-service` | Platform telemetry samples, health rollups and component snapshot read models | `platform_telemetry_samples`, `platform_health_rollups` | Phase 9 slice 9.1 for retention and snapshot read-side wiring |
| `incident-service` | Incidents, updates, maintenance windows and communications | None; incident state and communication attempts/retries/dead-letters are JSON-backed in `PlatformRepository`; status-page publishing uses `status-page-publisher.adapter.ts`; platform audit/outbox rows are owned by `feature-flag-service` | Phase 10 for incident Prisma tables |
| `feature-flag-service` | Feature flag rules, rollout evaluation, platform audit/outbox rows and internal tests | `feature_flag_rules`, `platform_audit_rows`, `platform_outbox_rows`; JSON-backed flag state remains in `PlatformRepository` | Phase 10 for cross-domain audit journal consolidation |
| `notification-service` | Notification descriptors, alert routing rules, subscriptions and delivery state | `platform_alert_routing_rules`; notification delivery is descriptor-only in current slices | Phase 9 slices 9.2-9.3 for alert and incident notification descriptors |
| `outbox-worker` | Transactional outbox rows, leases, retry backoff and dead-letter state | `outbox_events` | Phase 0 slices 0.3-0.4 for handler registration and dead-letter replay helpers |

Current table coverage checklist:

- `ai_scoring_audits`
- `billing_invoices`
- `billing_approvals`
- `billing_legal_entities`
- `billing_tax_documents`
- `billing_payment_dunning_states`
- `billing_payment_retry_keys`
- `billing_payment_retry_schedules`
- `billing_provider_sync_events`
- `billing_quota_ledger_entries`
- `billing_quota_reservations`
- `billing_reconciliation_conflicts`
- `billing_subscriptions`
- `billing_sync_jobs`
- `billing_tenant_states`
- `bot_publish_audit_events`
- `bot_scenario_versions`
- `bot_scenarios`
- `break_glass_approvals`
- `channel_delivery_receipts`
- `client_merge_conflicts`
- `client_merge_events`
- `client_profiles`
- `conversation_inbound_events`
- `conversation_messages`
- `conversation_outbound_descriptors`
- `conversation_realtime_events`
- `conversations`
- `credential_audit_events`
- `knowledge_approval_decisions`
- `knowledge_articles`
- `knowledge_draft_versions`
- `manual_qa_reviews`
- `mfa_challenges`
- `operator_capacities`
- `outbox_events`
- `oidc_callback_descriptors`
- `operations_object_storage_restore_check_results`
- `operations_postgres_restore_check_results`
- `oidc_provider_configs`
- `password_credentials`
- `password_policies`
- `permission_denial_events`
- `permission_roles`
- `feature_flag_rules`
- `platform_alert_routing_rules`
- `platform_audit_rows`
- `platform_health_rollups`
- `platform_outbox_rows`
- `platform_telemetry_samples`
- `public_api_key_reveal_states`
- `public_api_key_rotation_audit_events`
- `public_api_keys`
- `proactive_execution_windows`
- `proactive_experiment_assignments`
- `proactive_frequency_caps`
- `quality_ratings`
- `rbac_policy_versions`
- `rbac_role_grants`
- `queue_memberships`
- `routing_analytics_rows`
- `routing_rules`
- `saved_report_templates`
- `report_export_jobs`
- `report_idempotency_keys`
- `service_admin_audit_events`
- `service_admin_impersonations`
- `service_admin_sessions`
- `service_admin_token_pairs`
- `service_admin_token_revocations`
- `service_admin_token_rotations`
- `signed_webhook_replay_nonces`
- `tenant_audit_events`
- `tenant_users`
- `tenants`
- `template_audit_events`
- `template_records`
- `template_versions`
- `webhook_delivery_journal`
- `workspace_file_scan_result_idempotency`
- `workspace_files`
