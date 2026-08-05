# Client tariff and operator-limit administration

**Status:** completed

## Plan and decomposition

- [x] Keep tariff selection and changes in the protected service-admin billing workspace.
- [x] Require an administrator preview, a reason, and confirmation where the change policy requires it.
- [x] Remove all tenant-facing checkout, tariff-change, and subscription-cancellation API routes and UI controls.
- [x] Let the organization owner manage only the operator limit within the tariff already assigned by service administration.
- [x] Validate the tariff seat ceiling, active employee count, and the Free owner-only constraint on the server.
- [x] Enforce the selected operator limit in the employee invitation path.
- [x] Remove public trial language and make landing, pricing, and onboarding start with Free only.
- [x] Force the public provisioning endpoint to Free, so a crafted client payload cannot self-assign a paid tariff.
- [x] Show paid tariff prices per operator and calculate the monthly amount from the selected operator limit.
- [x] Add server-calculated tenant balance and service-admin manual balance top-ups with an idempotency key and recorded billing event.
- [x] Synchronize an owner-selected operator limit with billing subscription seats and calculate billing revenue per seat.
- [x] Treat the service-admin entitlement as the current tariff while provider reconciliation is pending.

## Important milestones

- The service-admin billing workspace is the sole tariff-management surface; it already records service-admin audit events.
- The tenant settings panel is informational for the tariff and actionable only for its allowed operator limit.
- Free remains immutable at one operator-owner.
- The billing subscription now receives the selected number of paid-plan seats, while `unitAmountMonthly` remains the per-operator price.
