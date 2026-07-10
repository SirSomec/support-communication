DELETE FROM "notifications"
WHERE "id" = 'notif-export-ready'
   OR ("category" = 'export_completion' AND "action_target" ->> 'jobId' = 'export-2418');
