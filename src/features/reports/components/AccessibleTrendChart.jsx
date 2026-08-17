import React, { useEffect, useMemo, useRef, useState } from "react";
import { formatCompactNumber } from "../model/reportMetricRegistry.js";

const CHART_HEIGHT = 286;
const MARGIN = { bottom: 34, left: 46, right: 18, top: 20 };

export function AccessibleTrendChart({ timeSeries }) {
  const containerRef = useRef(null);
  const [width, setWidth] = useState(720);
  const [activeIndex, setActiveIndex] = useState(Math.max(0, timeSeries.rows.length - 1));
  useEffect(() => {
    if (!containerRef.current || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(300, Math.round(entry.contentRect.width))));
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => setActiveIndex(Math.max(0, timeSeries.rows.length - 1)), [timeSeries.rows.length]);

  const geometry = useMemo(() => chartGeometry(timeSeries, width), [timeSeries, width]);
  const active = timeSeries.rows[activeIndex] ?? null;
  const summary = active
    ? `${active.label}: входящие ${active.incoming}, решено ${active.resolved}, бэклог ${active.backlog}.`
    : "За выбранный период данных для временного ряда нет.";

  return (
    <figure className="reports-trend-figure" ref={containerRef}>
      <figcaption className="reports-chart-heading">
        <span><strong>Динамика обращений</strong><small>Входящие, решенные и бэклог в одном временном масштабе</small></span>
        <span className="reports-chart-grain">{grainLabel(timeSeries.grain)}</span>
      </figcaption>
      <div className="reports-chart-legend" aria-label="Ряды графика">
        {timeSeries.series.map((series) => <span key={series.key}><i style={{ background: series.color }} />{series.label}</span>)}
      </div>
      {timeSeries.rows.length ? (
        <div className="reports-svg-wrap">
          <svg aria-label={`График динамики обращений. ${summary}`} onPointerLeave={() => setActiveIndex(Math.max(0, timeSeries.rows.length - 1))} role="img" viewBox={`0 0 ${width} ${CHART_HEIGHT}`}>
            <title key="chart-title">Динамика обращений</title>
            <g aria-hidden="true" key="y-grid">{geometry.yTicks.map((tick) => <g key={`y-${tick.value}`}><line className="reports-grid-line" x1={MARGIN.left} x2={width - MARGIN.right} y1={tick.y} y2={tick.y} /><text className="reports-axis-label" x={MARGIN.left - 9} y={tick.y + 4} textAnchor="end">{formatCompactNumber(tick.value)}</text></g>)}</g>
            <g aria-hidden="true" key="x-axis">{geometry.xTicks.map((tick) => <text className="reports-axis-label" key={`x-${tick.index}-${tick.label}`} x={tick.x} y={CHART_HEIGHT - 9} textAnchor="middle">{tick.label}</text>)}</g>
            <g aria-hidden="true" key="series">{geometry.series.map((series) => (
              <polyline className={`reports-series-line ${series.dashed ? "is-dashed" : ""}`} fill="none" key={`series-${series.key}`} points={series.points.map((point) => `${point.x},${point.y}`).join(" ")} stroke={series.color} />
            ))}</g>
            <g aria-hidden="true" key="hit-areas">{geometry.hitPoints.map((point) => <rect fill="transparent" height={CHART_HEIGHT - MARGIN.bottom - MARGIN.top} key={`hit-${point.index}`} onPointerEnter={() => setActiveIndex(point.index)} width={Math.max(12, geometry.step)} x={point.x - Math.max(12, geometry.step) / 2} y={MARGIN.top} />)}</g>
            {active && geometry.hitPoints[activeIndex] ? <g className="reports-active-point" key="active-point"><line x1={geometry.hitPoints[activeIndex].x} x2={geometry.hitPoints[activeIndex].x} y1={MARGIN.top} y2={CHART_HEIGHT - MARGIN.bottom} /><circle cx={geometry.hitPoints[activeIndex].x} cy={geometry.series[0]?.points[activeIndex]?.y ?? 0} r="4" /></g> : null}
          </svg>
          {active ? <div className="reports-chart-tooltip" role="status"><strong>{active.label}</strong><span>Входящие <b>{active.incoming}</b></span><span>Решено <b>{active.resolved}</b></span><span>Бэклог <b>{active.backlog}</b></span></div> : null}
        </div>
      ) : <div className="reports-chart-empty">Нет событий для построения динамики за выбранный период.</div>}
      <p className="reports-chart-summary">{summary}</p>
      {timeSeries.rows.length ? <details className="reports-chart-data"><summary>Табличные данные графика</summary><div><table><caption className="sr-only">Динамика обращений</caption><thead><tr><th scope="col">Период</th><th scope="col">Входящие</th><th scope="col">Решено</th><th scope="col">Бэклог</th></tr></thead><tbody>{timeSeries.rows.map((row) => <tr key={`${row.timestamp ?? ""}-${row.label}`}><th scope="row">{row.label}</th><td>{row.incoming}</td><td>{row.resolved}</td><td>{row.backlog}</td></tr>)}</tbody></table></div></details> : null}
    </figure>
  );
}

function chartGeometry(timeSeries, width) {
  const plotWidth = Math.max(1, width - MARGIN.left - MARGIN.right);
  const plotHeight = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;
  const maximum = Math.max(1, ...timeSeries.series.flatMap((series) => series.values).filter(Number.isFinite));
  const domainMax = niceMaximum(maximum);
  const count = timeSeries.rows.length;
  const step = count > 1 ? plotWidth / (count - 1) : plotWidth;
  const point = (value, index) => ({ x: count > 1 ? MARGIN.left + index * step : MARGIN.left + plotWidth / 2, y: MARGIN.top + plotHeight - Math.max(0, value) / domainMax * plotHeight });
  const labelEvery = Math.max(1, Math.ceil(count / Math.max(3, Math.floor(width / 92))));
  return {
    hitPoints: timeSeries.rows.map((_, index) => ({ ...point(0, index), index })),
    series: timeSeries.series.map((series) => ({ ...series, points: series.values.map(point) })),
    step,
    xTicks: timeSeries.rows.map((row, index) => ({ index, label: row.label, x: point(0, index).x })).filter((tick) => tick.index % labelEvery === 0 || tick.index === count - 1),
    yTicks: Array.from({ length: 5 }, (_, index) => ({ value: domainMax / 4 * index, y: MARGIN.top + plotHeight - plotHeight / 4 * index }))
  };
}

function niceMaximum(value) {
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude * 2) / 2 * magnitude;
}

function grainLabel(grain) {
  return grain === "hour" ? "По часам" : grain === "week" ? "По неделям" : "По дням";
}
