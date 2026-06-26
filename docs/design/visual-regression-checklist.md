# Visual Regression Checklist

Дата актуализации: 2026-06-26

Цель: единый ручной и полуавтоматический QA-чеклист для визуальных регрессий frontend-интерфейса support communication platform. Использовать перед merge крупных UI-изменений, изменений `src/styles.css`, feature CSS, shared UI-компонентов и рабочих cockpit-flow.

## Обязательные Viewports

- 390 x 844: mobile narrow.
- 768 x 1024: tablet.
- 1024 x 768: compact desktop.
- 1440 x 900: desktop.

## Core Screens

- Диалоги: очередь, chat pane, customer panel, composer, advanced filters.
- Диалоги: internal comment mode, attachment queue, save-template modal, draft-switch modal.
- Диалоги: rescue timer, bot handoff summary, AI suggestion card, audit transcript filter.
- Панель: online/break/active/waiting metrics and operator workload.
- Клиенты: list/detail, sensitive data masking, merge/unmerge surface.
- Шаблоны: list, editor, preview variables.
- Отчеты: filters, charts, export queue states.
- Визиты: active visitors, proactive builder, preview and A/B state.
- Качество: AI scoring/coaching, knowledge editor, self-service preview.
- Боты: flow canvas, inspector, import/export, handoff summary.
- Audit: filters, detail panel, export/retention controls.
- Настройки: access matrix, employees, channels, SDK console, webhooks/API, security.

## States To Capture

- Default loaded state.
- Empty/search-no-results state.
- Loading/error strip state when available.
- Disabled/read-only state for `Сотрудник` and `Старший сотрудник`.
- Modal open and keyboard focus state.
- Toast visible state.
- Dense data state with long labels, Russian text, badges and counters.

## Pass Criteria

- No horizontal document overflow at every viewport.
- No clipped button, badge, table, modal, tab or card text.
- Focus ring is visible on keyboard navigation.
- Icon-only controls have visible affordance and accessible label/title.
- Modals keep content in viewport and trap focus.
- Dense panels remain scannable without nested cards or accidental scroll traps.
- Color/tone semantics stay consistent: blue primary, red danger, amber warning, green success.
- Critical state badges remain visible above folds on desktop and mobile.

## Evidence

- Attach one screenshot per changed screen and breakpoint when the visual surface changes.
- Record console `error/warn` status.
- Link the Playwright smoke command and browser QA notes in the PR or handoff.
- If a visual difference is intentional, note the affected selector/component and reason.
