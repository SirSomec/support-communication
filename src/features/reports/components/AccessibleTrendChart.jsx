import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { formatCompactNumber, formatDurationSeconds, formatNumber } from "../model/reportMetricRegistry.js";
import {
  normalizeReportTrend,
  REPORT_TREND_GRAIN_OPTIONS,
  REPORT_TREND_METRIC_OPTIONS
} from "../model/reportViewState.js";
import { selectTrendExplorerView } from "../model/reportWorkspaceModel.js";

const CHART_HEIGHT = 286;
const MARGIN = { bottom: 34, left: 56, right: 18, top: 20 };

export function AccessibleTrendChart({ explorer, onSelectionChange, selection }) {
  const containerRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();
  const [width, setWidth] = useState(720);
  const chart = useMemo(
    () => selectTrendExplorerView(explorer, normalizeReportTrend(selection)),
    [explorer, selection?.grain, selection?.metric]
  );
  const signature = `${chart.metric}:${chart.grain}:${chart.rows.map((row) => row.timestamp ?? row.label).join("|")}`;
  const [activeIndex, setActiveIndex] = useState(Math.max(0, chart.rows.length - 1));

  useEffect(() => {
    if (!containerRef.current || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(300, Math.round(entry.contentRect.width))));
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setActiveIndex(Math.max(0, chart.rows.length - 1));
  }, [signature, chart.rows.length]);

  const geometry = useMemo(() => chartGeometry(chart, width), [chart, width]);
  const selectedIndex = Math.max(0, Math.min(chart.rows.length - 1, activeIndex));
  const active = chart.rows[selectedIndex] ?? null;
  const hasValues = chart.series.some((series) => series.values.some(Number.isFinite));
  const summary = active
    ? `${active.label}: ${chart.series.map((series) => `${series.label} ${formatChartValue(active.values[series.key], series.format, active.scaleMaximums[series.key])}`).join(", ")}.`
    : `За выбранный период данных для показателя «${chart.title}» нет.`;
  const metricOptions = chart.metricOptions?.length ? chart.metricOptions : REPORT_TREND_METRIC_OPTIONS;

  function updateSelection(patch) {
    onSelectionChange?.(normalizeReportTrend({ ...selection, ...patch }));
  }

  function moveActive(nextIndex) {
    if (!chart.rows.length) return;
    setActiveIndex(Math.max(0, Math.min(chart.rows.length - 1, nextIndex)));
  }

  function handleChartKeyDown(event) {
    if (event.key === "ArrowLeft") moveActive(selectedIndex - 1);
    else if (event.key === "ArrowRight") moveActive(selectedIndex + 1);
    else if (event.key === "Home") moveActive(0);
    else if (event.key === "End") moveActive(chart.rows.length - 1);
    else return;
    event.preventDefault();
  }

  return (
    <figure className="reports-trend-figure" ref={containerRef}>
      <figcaption className="reports-chart-heading reports-trend-heading">
        <span><strong>{chart.title}</strong><small>{chart.description}</small></span>
        <span className="reports-chart-grain">{grainLabel(chart.grain)}</span>
      </figcaption>

      <div aria-label="Настройки графика" className="reports-trend-toolbar" role="group">
        <label className="reports-trend-control">
          <span>Показатель графика</span>
          <select aria-label="Показатель графика" onChange={(event) => updateSelection({ metric: event.target.value })} value={chart.metric}>
            {metricOptions.map((option) => <option key={option.key ?? option.value} value={option.key ?? option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="reports-trend-control is-grain">
          <span>Периодичность</span>
          <select aria-label="Периодичность" onChange={(event) => updateSelection({ grain: event.target.value })} value={chart.grain}>
            {REPORT_TREND_GRAIN_OPTIONS.map((option) => (
              <option disabled={!chart.availableGrains.includes(option.value)} key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div aria-label="Ряды графика" className="reports-chart-legend">
        {chart.series.map((series) => (
          <span key={series.key}><i className={series.dashed ? "is-dashed" : ""} style={{ "--series-color": series.color }} />{series.label}</span>
        ))}
      </div>

      {chart.rows.length && hasValues ? (
        <div className="reports-svg-wrap">
          <svg
            aria-labelledby={`${titleId} ${descriptionId}`}
            focusable="true"
            onKeyDown={handleChartKeyDown}
            role="img"
            tabIndex="0"
            viewBox={`0 0 ${width} ${CHART_HEIGHT}`}
          >
            <title id={titleId}>График «{chart.title}», {grainLabel(chart.grain).toLowerCase()}</title>
            <desc id={descriptionId}>{summary} Для выбора периода используйте стрелки влево и вправо, Home и End.</desc>
            <g aria-hidden="true">{geometry.yTicks.map((tick) => (
              <g key={`y-${tick.value}`}>
                <line className="reports-grid-line" x1={MARGIN.left} x2={width - MARGIN.right} y1={tick.y} y2={tick.y} />
                <text className="reports-axis-label" x={MARGIN.left - 9} y={tick.y + 4} textAnchor="end">{formatAxisValue(tick.value, chart.format)}</text>
              </g>
            ))}</g>
            <g aria-hidden="true">{geometry.xTicks.map((tick) => (
              <text className="reports-axis-label" key={`x-${tick.index}-${tick.label}`} x={tick.x} y={CHART_HEIGHT - 9} textAnchor="middle">{tick.label}</text>
            ))}</g>
            <g aria-hidden="true">{geometry.series.map((series) => renderSeries(series, chart.chartType, geometry.baseline))}</g>
            <g aria-hidden="true">{geometry.hitPoints.map((point) => (
              <rect
                fill="transparent"
                height={CHART_HEIGHT - MARGIN.bottom - MARGIN.top}
                key={`hit-${point.index}`}
                onPointerDown={() => setActiveIndex(point.index)}
                onPointerEnter={() => setActiveIndex(point.index)}
                width={point.hitWidth}
                x={point.hitX}
                y={MARGIN.top}
              />
            ))}</g>
            {active && geometry.hitPoints[selectedIndex] ? (
              <g aria-hidden="true" className="reports-active-point">
                <line x1={geometry.hitPoints[selectedIndex].x} x2={geometry.hitPoints[selectedIndex].x} y1={MARGIN.top} y2={geometry.baseline} />
                {geometry.series.map((series) => {
                  const point = series.points[selectedIndex];
                  return Number.isFinite(point?.y)
                    ? <circle cx={point.x} cy={point.y} key={series.key} r="4" style={{ "--series-color": series.color }} />
                    : null;
                })}
              </g>
            ) : null}
          </svg>
          {active ? <ChartTooltip active={active} chart={chart} /> : null}
        </div>
      ) : (
        <div className="reports-chart-empty">
          {chart.incompatibleRatingScales
            ? "Нельзя сравнить CSAT: в периодах использовались разные шкалы оценки."
            : `Нет измеримых значений для показателя «${chart.title}» за выбранный период.`}
        </div>
      )}

      {chart.rows.length ? (
        <div className="reports-chart-navigation">
          <button aria-label="Предыдущий период графика" disabled={selectedIndex <= 0} onClick={() => moveActive(selectedIndex - 1)} type="button">← Предыдущий</button>
          <span aria-live="polite">{selectedIndex + 1} из {chart.rows.length}</span>
          <button aria-label="Следующий период графика" disabled={selectedIndex >= chart.rows.length - 1} onClick={() => moveActive(selectedIndex + 1)} type="button">Следующий →</button>
        </div>
      ) : null}
      <p aria-live="polite" className="reports-chart-summary">{summary}</p>
      {chart.rows.length ? <TrendDataTable chart={chart} /> : null}
    </figure>
  );
}

function ChartTooltip({ active, chart }) {
  return (
    <div className="reports-chart-tooltip">
      <strong>{active.label}</strong>
      {chart.series.map((series) => {
        const samples = active.samples[series.key];
        return (
          <span className="reports-chart-tooltip-row" key={series.key}>
            <span>{series.label}</span>
            <b>{formatChartValue(active.values[series.key], series.format, active.scaleMaximums[series.key])}</b>
            {samples !== null ? <small>n={formatInteger(samples)}</small> : null}
          </span>
        );
      })}
    </div>
  );
}

function TrendDataTable({ chart }) {
  return (
    <details className="reports-chart-data">
      <summary>Табличные данные графика</summary>
      <div>
        <table>
          <caption className="sr-only">{chart.title} по периодам, {grainLabel(chart.grain).toLowerCase()}</caption>
          <thead><tr><th scope="col">Период</th>{chart.series.map((series) => <th key={series.key} scope="col">{series.label}</th>)}</tr></thead>
          <tbody>{chart.rows.map((row, index) => (
            <tr key={`${row.timestamp ?? ""}-${row.label}-${index}`}>
              <th scope="row">{row.label}</th>
              {chart.series.map((series) => (
                <td key={series.key}>
                  {formatChartValue(row.values[series.key], series.format, row.scaleMaximums[series.key])}
                  {row.samples[series.key] !== null ? <small>n={formatInteger(row.samples[series.key])}</small> : null}
                </td>
              ))}
            </tr>
          ))}</tbody>
        </table>
      </div>
    </details>
  );
}

function chartGeometry(chart, width) {
  const plotWidth = Math.max(1, width - MARGIN.left - MARGIN.right);
  const plotHeight = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;
  const finiteValues = chart.series.flatMap((series) => series.values).filter(Number.isFinite);
  const domainMin = Number.isFinite(chart.domain?.min) ? Number(chart.domain.min) : 0;
  const measuredMaximum = finiteValues.length ? Math.max(...finiteValues) : domainMin + 1;
  const domainMax = Number.isFinite(chart.domain?.max)
    ? Number(chart.domain.max)
    : niceMaximum(Math.max(domainMin + 1, measuredMaximum));
  const span = Math.max(1, domainMax - domainMin);
  const count = chart.rows.length;
  const usesBars = chart.series.some((series) => (series.chartType ?? chart.chartType) === "bar");
  const step = usesBars ? plotWidth / Math.max(1, count) : count > 1 ? plotWidth / (count - 1) : plotWidth;
  const xForIndex = (index) => usesBars
    ? MARGIN.left + step * (index + 0.5)
    : count > 1 ? MARGIN.left + index * step : MARGIN.left + plotWidth / 2;
  const yForValue = (value) => Number.isFinite(value)
    ? MARGIN.top + plotHeight - (Number(value) - domainMin) / span * plotHeight
    : null;
  const baseline = yForValue(domainMin);
  const barSeries = chart.series.filter((series) => (series.chartType ?? chart.chartType) === "bar");
  const labelEvery = Math.max(1, Math.ceil(count / Math.max(3, Math.floor(width / 100))));
  const xPositions = chart.rows.map((_, index) => xForIndex(index));
  return {
    baseline,
    hitPoints: xPositions.map((x, index) => {
      const hitX = index === 0 ? MARGIN.left : (xPositions[index - 1] + x) / 2;
      const hitRight = index === xPositions.length - 1 ? width - MARGIN.right : (x + xPositions[index + 1]) / 2;
      return { hitWidth: Math.max(1, hitRight - hitX), hitX, index, x };
    }),
    series: chart.series.map((series) => ({
      ...series,
      barIndex: barSeries.findIndex(({ key }) => key === series.key),
      barSeriesCount: barSeries.length,
      points: series.values.map((value, index) => ({ value, x: xForIndex(index), y: yForValue(value) })),
      step
    })),
    step,
    xTicks: chart.rows
      .map((row, index) => ({ index, label: row.label, x: xForIndex(index) }))
      .filter((tick) => tick.index % labelEvery === 0 || tick.index === count - 1),
    yTicks: Array.from({ length: 5 }, (_, index) => ({
      value: domainMin + span / 4 * index,
      y: MARGIN.top + plotHeight - plotHeight / 4 * index
    }))
  };
}

function renderSeries(series, fallbackType, baseline) {
  const type = series.chartType ?? fallbackType;
  if (type === "bar") {
    const groupWidth = Math.min(58, series.step * 0.72);
    const barWidth = Math.max(0.5, groupWidth / Math.max(1, series.barSeriesCount));
    return (
      <g className="reports-series-bars" key={series.key}>
        {series.points.map((point, index) => Number.isFinite(point.y) ? (
          <rect
            fill={series.color}
            height={Math.max(1, baseline - point.y)}
            key={`${series.key}-${index}`}
            rx="2"
            width={Math.max(0.5, barWidth - 0.5)}
            x={point.x - groupWidth / 2 + series.barIndex * barWidth + 0.25}
            y={Math.min(point.y, baseline - 1)}
          />
        ) : null)}
      </g>
    );
  }

  const segments = contiguousSegments(series.points);
  if (type === "area") {
    return (
      <g className="reports-series-area" key={series.key}>
        {segments.map((segment, index) => (
          <path d={areaPath(segment, baseline)} fill={series.color} key={`${series.key}-${index}`} stroke={series.color} />
        ))}
      </g>
    );
  }

  return (
    <g key={series.key}>
      {segments.map((segment, index) => segment.length === 1
        ? <circle className="reports-series-dot" cx={segment[0].x} cy={segment[0].y} fill={series.color} key={`${series.key}-${index}`} r="3" />
        : <polyline className={`reports-series-line ${series.dashed ? "is-dashed" : ""}`} fill="none" key={`${series.key}-${index}`} points={segment.map((point) => `${point.x},${point.y}`).join(" ")} stroke={series.color} />)}
    </g>
  );
}

function contiguousSegments(points) {
  const segments = [];
  let current = [];
  for (const point of points) {
    if (Number.isFinite(point.y)) current.push(point);
    else if (current.length) {
      segments.push(current);
      current = [];
    }
  }
  if (current.length) segments.push(current);
  return segments;
}

function areaPath(points, baseline) {
  if (!points.length) return "";
  return `M ${points[0].x} ${baseline} L ${points.map((point) => `${point.x} ${point.y}`).join(" L ")} L ${points.at(-1).x} ${baseline} Z`;
}

function formatChartValue(value, format, scaleMaximum) {
  if (!Number.isFinite(value)) return "—";
  if (format === "duration") return formatDurationSeconds(Number(value));
  if (format === "percent") return `${formatNumber(Number(value), 1)}%`;
  if (format === "rating") {
    const formatted = formatNumber(Number(value), 2);
    return Number.isFinite(scaleMaximum) ? `${formatted} / ${formatNumber(Number(scaleMaximum), 2)}` : formatted;
  }
  if (format === "ratio") return formatNumber(Number(value), 2);
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(Number(value));
}

function formatAxisValue(value, format) {
  if (format === "duration") return formatDurationSeconds(value);
  if (format === "percent") return `${formatNumber(value, 0)}%`;
  if (format === "rating" || format === "ratio") return formatNumber(value, 1);
  return formatCompactNumber(value);
}

function formatInteger(value) {
  return Number.isFinite(Number(value)) ? new Intl.NumberFormat("ru-RU").format(Number(value)) : "—";
}

function niceMaximum(value) {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude * 2) / 2 * magnitude;
}

function grainLabel(grain) {
  return REPORT_TREND_GRAIN_OPTIONS.find((option) => option.value === grain)?.label ?? "По дням";
}
