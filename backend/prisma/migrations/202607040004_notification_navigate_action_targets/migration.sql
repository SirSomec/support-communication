UPDATE "notifications"
SET "action_target" = jsonb_build_object(
    'kind', 'navigate',
    'resourceId', 'vladimir',
    'section', 'dialogs'
)
WHERE "id" = 'notif-sla-vladimir';

UPDATE "notifications"
SET "action_target" = jsonb_build_object(
    'kind', 'navigate',
    'resourceId', 'anna',
    'section', 'dialogs'
)
WHERE "id" = 'notif-mention-anna';

UPDATE "notifications"
SET "action_target" = jsonb_build_object(
    'kind', 'navigate',
    'resourceId', 'vk',
    'section', 'settings'
)
WHERE "id" = 'notif-channel-vk';

UPDATE "notifications"
SET "action_target" = jsonb_build_object(
    'kind', 'navigate',
    'resourceId', 'tenant-ladoga',
    'section', 'panel'
)
WHERE "id" = 'notif-ladoga-sla';

UPDATE "notifications"
SET "action_target" = jsonb_build_object(
    'kind', 'navigate',
    'resourceId', 'service-admin-audit',
    'section', 'audit'
)
WHERE "id" = 'notif-privileged-admin';
