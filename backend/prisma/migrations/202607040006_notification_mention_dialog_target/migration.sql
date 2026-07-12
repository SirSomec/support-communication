UPDATE "notifications"
SET "action_target" = jsonb_build_object(
    'kind', 'navigate',
    'resourceId', 'irina',
    'section', 'dialogs'
)
WHERE "id" = 'notif-mention-anna';
