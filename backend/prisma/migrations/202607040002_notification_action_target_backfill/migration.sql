UPDATE "notifications"
SET "action_target" = jsonb_build_object(
    'fileName', 'export-2418.xlsx',
    'format', 'XLSX',
    'jobId', 'export-2418',
    'kind', 'download',
    'service', 'reports'
)
WHERE "id" = 'notif-export-ready'
  AND "action_target" IS NULL;
