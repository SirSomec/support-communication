# Client tariff and operator-limit administration

**Status:** completed

## Plan and decomposition

- [x] Keep tariff selection and changes in the protected service-admin billing workspace.
- [x] Require an administrator preview, a reason, and confirmation where the change policy requires it.
- [x] Remove all tenant-facing checkout, tariff-change, and subscription-cancellation API routes and UI controls.
- [x] Let the organization owner manage only the operator limit within the tariff already assigned by service administration.
- [x] Validate the tariff seat ceiling, active employee count, and the Free owner-only constraint on the server.
- [x] Enforce the selected operator limit in the employee invitation path.

## Important milestones

- The service-admin billing workspace is the sole tariff-management surface; it already records service-admin audit events.
- The tenant settings panel is informational for the tariff and actionable only for its allowed operator limit.
- Free remains immutable at one operator-owner.
