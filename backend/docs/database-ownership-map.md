# Database Ownership Map

This document is the source-of-truth map for PostgreSQL table ownership across backend service schemas.

Rules:

- Each PostgreSQL table has exactly one owner service.
- Services do not read another service's tables directly; use explicit APIs, events or read models.
- Shared infrastructure tables are owned by the service that operates the infrastructure contract.
- Rows without current tables define the owner for the next migration slice before tables are added.

| Owner service | Responsibility boundary | Current PostgreSQL tables | Next migration slice |
| --- | --- | --- | --- |
| `api-gateway` | External REST API, request envelope, auth context handoff and operations readiness runtime rows | `operations_runtime_records`, `operations_postgres_restore_check_results`, `operations_object_storage_restore_check_results` | Operations runtime persistence has Prisma parity for load-test, restore-check, dead-letter replay, migration rollback-check and idempotency descriptors. |
| `realtime-gateway` | SSE/WebSocket delivery and multi-instance fan-out | None; current durable realtime events are owned by `conversation-service` | Phase 2 slices 2.4-2.5 for Redis fan-out and multi-instance cursor checks |
| `auth-service` | MFA challenges, invite/recovery auth-flow tokens, service-admin sessions, credential/session lifecycle | `mfa_challenges`, `auth_invite_tokens`, `auth_recovery_tokens`, `service_admin_sessions`, `service_admin_token_pairs`, `service_admin_token_rotations`, `service_admin_token_revocations`, `password_credentials`, `password_policies`, `credential_audit_events`, `oidc_provider_configs`, `oidc_callback_descriptors`, `saml_provider_metadata`, `saml_acs_request_descriptors`, `saml_assertion_replays` | Phase 1 slices 1.2-1.4 for token, OIDC and SAML persistence |
| `tenant-service` | Tenant catalog, tenant users, tenant status, workspace settings rules, workspace topic directory, workspace service mail settings and tenant audit events | `tenants`, `tenant_users`, `tenant_audit_events`, `settings_rules`, `settings_rule_audit_events`, `workspace_topics`, `workspace_mail_settings` | Tenant and workspace settings persistence has Prisma parity; cross-service consumers use the tenant API contract. |
| `rbac-service` | Permission roles, policy versions, role grants and permission denial events | `permission_roles`, `rbac_policy_versions`, `rbac_role_grants`, `permission_denial_events` | Phase 1 slice 1.5 for RBAC policy versions and tenant-scoped permission denials |
| `conversation-service` | Dialog lifecycle, conversation messages, inbound idempotency, outbound descriptors and persisted realtime events | `conversations`, `conversation_lifecycle_events`, `conversation_messages`, `conversation_inbound_events`, `conversation_outbound_descriptors`, `conversation_realtime_events` | Phase 2 slices 2.1-2.5 for provider receipts and realtime fan-out |
| `message-service` | Message-specific delivery/read state, provider message identity bindings and drafts | `channel_delivery_receipts`, `provider_message_bindings` | Provider message bindings and receipt persistence have Prisma parity; realtime delivery updates remain event-driven. |
| `channel-service` | Channel provider configuration, channel capabilities and external open-channel delivery state | `open_channel_chat_channels`, `open_channel_external_bot_connections`, `open_channel_event_webhook_subscriptions`, `open_channel_conversation_states`, `open_channel_deliveries`, `open_channel_pump_cursors` | Open-channel administration, delivery retry state and pump cursors have Prisma parity. |
| `client-profile-service` | Client identities, merge graph, profile conflict state and export job descriptors | `client_profiles`, `client_merge_events`, `client_merge_conflicts`, `client_export_jobs` | Phase 3 slice 3.1 for JSON/Prisma client repository adapters |
| `template-knowledge-service` | Templates, knowledge sources, ingestion, article versions, approval decisions and publication state | `template_records`, `template_versions`, `template_audit_events`, `knowledge_articles`, `knowledge_draft_versions`, `knowledge_approval_decisions`, `knowledge_sources`, `knowledge_ingestion_jobs`, `mcp_connectors`, `unanswered_questions`, `url_source_policies` | Knowledge source, connector, ingestion and publication persistence has Prisma parity. |
| `routing-sla-service` | Teams, queues, operator presence, routing rules, assignments, SLA timers, rescue jobs and routing outcomes | `teams`, `team_memberships`, `support_queues`, `operator_presence_intervals`, `routing_rules`, `queue_memberships`, `operator_capacities`, `routing_analytics_rows`, `routing_jobs`, `routing_state_snapshots` | Routing directory, presence and runtime state have Prisma parity; provider/runtime smoke remains outside this ownership map. |
| `report-service` | Metric definitions, report jobs, export files, saved templates and scheduled digests | `metric_definitions`, `metric_versions`, `metric_tenant_overrides`, `saved_report_templates`, `report_export_jobs`, `report_idempotency_keys`, `report_query_executions`, `report_file_descriptors`, `report_notification_descriptors`, `scheduled_digest_descriptors`, `report_export_retry_audit_events` | Phase 5 Prisma persistence is complete for current report runtime descriptors |
| `integration-webhook-service` | Public API keys, webhook verification, delivery/replay workers, public demo request lead descriptors, tenant channel connections, provider credentials, SDK presence, Telegram runtime state and security session revocation state | `public_api_keys`, `public_api_key_reveal_states`, `public_api_key_rotation_audit_events`, `integration_api_key_rotation_jobs`, `signed_webhook_replay_nonces`, `webhook_endpoints`, `webhook_delivery_journal`, `webhook_replay_journal`, `webhook_replay_audit_events`, `public_demo_requests`, `public_demo_request_audit_events`, `public_demo_request_notification_descriptors`, `integration_security_sessions`, `integration_channel_connections`, `integration_channel_connection_events`, `integration_channel_connection_audit_events`, `provider_connection_credentials`, `sdk_visitor_presence_sessions`, `telegram_connections` | Integration runtime persistence has Prisma parity; provider/runtime smoke remains Phase 9 work. |
| `file-service` | Upload metadata, scan state, scan callback idempotency and object storage policy | `workspace_files`, `workspace_file_scan_result_idempotency` | Phase 3 slices 3.4-3.6 for storage verification, scanner worker and attachment limits |
| `automation-bot-service` | Bot scenarios, agent sessions, runtime journals, sandbox usage, proactive execution, SDK invitation exposure lifecycle and bot handoff events | `bot_scenarios`, `bot_scenario_versions`, `bot_publish_audit_events`, `automation_publish_idempotency_keys`, `automation_bot_test_runs`, `automation_scenario_audit_events`, `automation_workspace_audit_events`, `agent_session_states`, `bot_ai_feedback`, `bot_runtime_instances`, `bot_runtime_step_journal`, `bot_runtime_side_effects`, `bot_sandbox_sessions`, `bot_sandbox_usage_counters`, `proactive_rules`, `proactive_execution_windows`, `proactive_frequency_caps`, `proactive_experiment_assignments`, `proactive_delivery_attempts`, `proactive_delivery_idempotency_keys`, `proactive_delivery_attributions`, `proactive_exposures`, `proactive_conversion_events` | Automation runtime, audit and proactive attribution persistence has Prisma parity; provider/runtime smoke remains Phase 9 work. |
| `quality-ai-service` | AI provider connections and usage, suggestion decisions, quality ratings, manual QA reviews and AI scoring telemetry | `ai_connections`, `ai_usage_counters`, `ai_suggestion_decisions`, `quality_ratings`, `manual_qa_reviews`, `ai_scoring_audits`, `quality_scoring_request_telemetry`, `quality_scoring_response_telemetry`, `quality_scoring_failure_envelopes` | AI connection, usage, decision and scoring telemetry persistence has Prisma parity. |
| `billing-service` | Billing tenant state, quota ledger/reservations, subscriptions, invoices, provider sync jobs, payment retry schedules, dunning state, reconciliation conflicts, retry keys and approval workflow state | `billing_tenant_states`, `billing_sync_jobs`, `billing_quota_ledger_entries`, `billing_quota_reservations`, `billing_subscriptions`, `billing_invoices`, `billing_provider_sync_events`, `billing_payment_retry_schedules`, `billing_payment_dunning_states`, `billing_reconciliation_conflicts`, `billing_payment_retry_keys`, `billing_approvals`, `billing_legal_entities`, `billing_tax_documents` | Phase 8 slice 8.2 for billing approval, legal entity and tax document persistence |
| `audit-service` | Immutable audit journal, redaction overlays and audit exports | None; current audit-like rows stay with their producing services until the audit service owns the cross-domain journal | Phase 10 slice 10.7 for audit immutability gates |
| `platform-admin-service` | Service-admin audit, impersonation, audit exports, redactions and break-glass approvals | `service_admin_audit_events`, `service_admin_audit_exports`, `service_admin_audit_redactions`, `service_admin_impersonations`, `break_glass_approvals` | Phase 1 slice 1.5 and Phase 10 slices 10.6-10.8 for cross-surface hardening |
| `platform-monitoring-service` | Platform telemetry samples, health rollups, platform runtime descriptors and component snapshot read models | `platform_telemetry_samples`, `platform_health_rollups`, `platform_runtime_records` | Platform runtime persistence has Prisma parity for telemetry, health, alerts, incidents, feature-flag runtime rows and communication descriptors. |
| `incident-service` | Incidents, updates, maintenance windows and communications | None; incident state, idempotency keys and communication attempts are collection-scoped rows in the platform runtime table owned by `platform-monitoring-service`; status-page publishing uses `status-page-publisher.adapter.ts`; platform audit/outbox rows are owned by `feature-flag-service` | Phase 10 for cross-domain audit journal consolidation |
| `feature-flag-service` | Feature flag rules, rollout evaluation, platform audit/outbox rows and internal tests | `feature_flag_rules`, `platform_audit_rows`, `platform_outbox_rows`; mutable flag state and rollout outbox descriptors are collection-scoped rows in the platform runtime table owned by `platform-monitoring-service` | Phase 10 for cross-domain audit journal consolidation |
| `notification-service` | Inbox notifications, preferences, browser push subscriptions, delivery descriptors, preference audit events and platform alert routing rules | `notifications`, `notification_preferences`, `browser_push_subscriptions`, `notification_delivery_descriptors`, `notification_preference_audit_events`, `platform_alert_routing_rules` | Notification runtime persistence has Prisma parity; provider/runtime smoke remains Phase 9 work |
| `outbox-worker` | Transactional outbox rows, provider attachment transfer state, leases, retry backoff and dead-letter state | `outbox_events`, `provider_attachment_transfers` | Outbox delivery, attachment transfer idempotency and dead-letter replay helpers have Prisma parity. |

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
- `automation_bot_test_runs`
- `automation_publish_idempotency_keys`
- `auth_invite_tokens`
- `auth_recovery_tokens`
- `bot_publish_audit_events`
- `bot_scenario_versions`
- `bot_scenarios`
- `break_glass_approvals`
- `channel_delivery_receipts`
- `client_merge_conflicts`
- `client_merge_events`
- `client_export_jobs`
- `client_profiles`
- `conversation_inbound_events`
- `conversation_messages`
- `conversation_outbound_descriptors`
- `conversation_realtime_events`
- `conversations`
- `credential_audit_events`
- `integration_api_key_rotation_jobs`
- `integration_channel_connection_audit_events`
- `integration_channel_connection_events`
- `integration_channel_connections`
- `integration_security_sessions`
- `knowledge_approval_decisions`
- `knowledge_articles`
- `knowledge_draft_versions`
- `manual_qa_reviews`
- `metric_definitions`
- `metric_tenant_overrides`
- `metric_versions`
- `mfa_challenges`
- `notification_delivery_descriptors`
- `notification_preference_audit_events`
- `notification_preferences`
- `notifications`
- `operator_capacities`
- `outbox_events`
- `oidc_callback_descriptors`
- `operations_object_storage_restore_check_results`
- `operations_postgres_restore_check_results`
- `operations_runtime_records`
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
- `platform_runtime_records`
- `platform_telemetry_samples`
- `public_api_key_reveal_states`
- `public_api_key_rotation_audit_events`
- `public_api_keys`
- `public_demo_request_audit_events`
- `public_demo_request_notification_descriptors`
- `public_demo_requests`
- `proactive_delivery_attempts`
- `proactive_delivery_attributions`
- `proactive_delivery_idempotency_keys`
- `proactive_exposures`
- `proactive_execution_windows`
- `proactive_experiment_assignments`
- `proactive_frequency_caps`
- `proactive_rules`
- `quality_ratings`
- `rbac_policy_versions`
- `rbac_role_grants`
- `queue_memberships`
- `routing_analytics_rows`
- `routing_jobs`
- `routing_rules`
- `routing_state_snapshots`
- `saved_report_templates`
- `report_export_jobs`
- `report_export_retry_audit_events`
- `report_file_descriptors`
- `report_idempotency_keys`
- `report_notification_descriptors`
- `report_query_executions`
- `scheduled_digest_descriptors`
- `service_admin_audit_events`
- `service_admin_audit_exports`
- `service_admin_audit_redactions`
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
- `telegram_connections`
- `webhook_delivery_journal`
- `webhook_replay_audit_events`
- `webhook_replay_journal`
- `workspace_file_scan_result_idempotency`
- `workspace_files`
