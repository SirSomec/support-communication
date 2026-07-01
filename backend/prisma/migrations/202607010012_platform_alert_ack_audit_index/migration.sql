CREATE INDEX "platform_audit_rows_ack_action_target_idx" ON "platform_audit_rows"("mutation_kind", "action", "target", "created_at");
