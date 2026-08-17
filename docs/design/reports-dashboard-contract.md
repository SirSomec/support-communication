# Reports dashboard design contract

Status: approved for implementation on 2026-08-18 by the user's instruction
"Верно. Действуй согласно изначальным инструкциям и доведи эту вкладку до
состояния полностью рабочего продукта."

## References

- Desktop: `C:\Users\sirso\.codex\generated_images\01a01172-a369-7182-993b-b5abead1ae87\exec-7c44209b-09e4-46ae-984f-a71a552c4a03.png`
- Mobile portrait (390 px): `C:\Users\sirso\.codex\generated_images\01a01172-a369-7182-993b-b5abead1ae87\exec-e6e213e4-ae43-4706-b7f3-157c58004514.png`

## Evidence lock

Audience: operational head of a customer-support team. The default view must
answer, before interaction: how much demand arrived, how much was resolved,
whether the queue is accumulating, whether response and resolution speed are
healthy, and where service quality needs attention.

Only persisted tenant data may be rendered. Missing instrumentation is shown as
unavailable with a reason; it must never be replaced by sample values. Every
percentage keeps its numerator, denominator, sample size, definition and source
available in the UI or metric glossary. Period, timezone and active filters must
be identical for cards, charts, tables and exports.

## Locked visual and interaction elements

- True-white operational canvas with navy text, restrained blue primary accent,
  teal success, amber risk, red breach, and quiet grey structure.
- Reading order: compact command bar; KPI rail; dominant incoming/resolved/backlog
  time series; service-level and queue-health diagnostics; channel and team/topic
  breakdowns; data quality and export history on demand.
- Desktop uses a dominant central evidence area and a compact right insight rail.
- Mobile keeps the KPI rail and primary trend visible before filters/settings;
  KPI cards scroll horizontally, secondary controls open as sheets/drawers, and
  wide tables become ranked rows or horizontal scroll regions.
- Period presets and a validated custom date range; equal previous-period
  comparison; server-provided filters with Apply, Reset and a visible active-state
  summary.
- Export menu supports server-owned XLSX, CSV and JSON snapshots, printable/PDF
  layout, transcript formats, progress, retry, download and immutable audit.
- Last-known-good data stays visible during refresh. Loading, refreshing, stale,
  partial, empty and error states are distinct; errors expose Retry.
- All values, labels, axes and annotations are code-native React/HTML/SVG. Charts
  have keyboard-readable summaries and tabular equivalents. Essential values do
  not depend on hover or color alone.
- Touch targets are at least 44 px on coarse pointers. Motion is limited to short
  state transitions and is removed under `prefers-reduced-motion`.

## KPI model

Hero outcomes/drivers: incoming, resolved, backlog, recorded SLA attainment,
first-response P50/P90, resolution P50/P90, CSAT with sample/coverage, and reopen
rate. Diagnostics include flow ratio, waiting/overdue, response coverage,
one-touch-resolution proxy, next-response time, backlog age, channel/topic mix,
operator workload, transfers, internal comments, and AI/handoff metrics only when
their event data is present.

Formal FCR, AHT, occupancy, cost per resolution and policy-aware SLA are never
inferred from assignment duration. They remain explicitly unavailable until the
required customer/topic linkage, presence/time tracking, cost or SLA-policy
instrumentation exists.

## Visualization inventory

| Layer | Job | Encoding | Mobile/fallback | QA |
| --- | --- | --- | --- | --- |
| KPI rail | First-scan status and previous-period movement | Exact value, signed delta, semantic tone and sample | Horizontal scroll; definition dialog | Value/delta/unit reconciliation |
| Flow trend | Incoming vs resolved and backlog movement | Two direct-labelled SVG lines plus backlog area/line; honest zero scale | Reduced ticks, always-visible latest values, accessible table | Series totals and zero-state tests |
| Service level | Explain speed and recorded SLA | P50/P90 rows, threshold/reference, breach/eligible counts | Stacked rows, no hover dependency | Quantiles, denominators, contrast |
| Queue health | Show accumulated work and age risk | Backlog age horizontal bars with exact counts | Same ordering, full-width bars | Bucket sum equals backlog |
| Channel/topic | Locate demand and quality drivers | Ranked semantic table with in-cell bars | Critical columns first; horizontal scroll/details | Totals reconcile with filters |
| Team workload | Operational follow-up, not a quality league table | Assigned/open/resolved/transfer counts and guarded quality samples | Ranked rows | Stable IDs, minimum sample labels |
| Insights | Deterministic anomaly/action summary | Text generated from measured deltas/thresholds only | Horizontal/stacked actions | Each statement traces to a metric |

## Flexible implementation details

Exact spacing, breakpoints, SVG geometry, tick density and component boundaries may
change to fit the existing app shell, provided the reading order, evidence
hierarchy, color meanings, definitions, source/caveat visibility and mobile-first
rules above remain unchanged.
