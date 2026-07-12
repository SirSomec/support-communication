/**
 * Lightweight in-process metrics registry.
 * Labels must stay low-cardinality and free of PII (no message text, emails, raw conversation ids).
 */

export type MetricLabelValue = string | number | boolean | undefined | null;

export interface MetricLabels {
  [key: string]: MetricLabelValue;
}

export interface CounterSnapshot {
  help: string;
  name: string;
  samples: Array<{ labels: Record<string, string>; value: number }>;
  type: "counter";
}

export interface HistogramSnapshot {
  help: string;
  name: string;
  samples: Array<{
    buckets: Record<string, number>;
    count: number;
    labels: Record<string, string>;
    sum: number;
  }>;
  type: "histogram";
}

export type MetricSnapshot = CounterSnapshot | HistogramSnapshot;

const DEFAULT_LATENCY_BUCKETS_MS = [25, 50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000];
const DEFAULT_SCORE_BUCKETS = [0.1, 0.25, 0.5, 0.75, 0.9, 1];
const DEFAULT_COUNT_BUCKETS = [0, 1, 2, 4, 8, 16];

class CounterMetric {
  private readonly values = new Map<string, { labels: Record<string, string>; value: number }>();

  constructor(readonly name: string, readonly help: string) {}

  inc(labels: MetricLabels = {}, value = 1): void {
    if (!Number.isFinite(value) || value < 0) return;
    const normalized = normalizeLabels(labels);
    const key = labelKey(normalized);
    const current = this.values.get(key);
    if (current) {
      current.value += value;
      return;
    }
    this.values.set(key, { labels: normalized, value });
  }

  snapshot(): CounterSnapshot {
    return {
      help: this.help,
      name: this.name,
      samples: Array.from(this.values.values()).map((sample) => ({
        labels: { ...sample.labels },
        value: sample.value
      })),
      type: "counter"
    };
  }

  reset(): void {
    this.values.clear();
  }
}

class HistogramMetric {
  private readonly values = new Map<string, {
    buckets: number[];
    count: number;
    labels: Record<string, string>;
    sum: number;
  }>();

  constructor(
    readonly name: string,
    readonly help: string,
    private readonly bucketBounds: number[]
  ) {}

  observe(labels: MetricLabels = {}, value: number): void {
    if (!Number.isFinite(value)) return;
    const normalized = normalizeLabels(labels);
    const key = labelKey(normalized);
    let current = this.values.get(key);
    if (!current) {
      current = {
        buckets: this.bucketBounds.map(() => 0),
        count: 0,
        labels: normalized,
        sum: 0
      };
      this.values.set(key, current);
    }
    current.count += 1;
    current.sum += value;
    for (let index = 0; index < this.bucketBounds.length; index += 1) {
      if (value <= this.bucketBounds[index]!) current.buckets[index]! += 1;
    }
  }

  snapshot(): HistogramSnapshot {
    return {
      help: this.help,
      name: this.name,
      samples: Array.from(this.values.values()).map((sample) => {
        const buckets: Record<string, number> = {};
        for (let index = 0; index < this.bucketBounds.length; index += 1) {
          buckets[String(this.bucketBounds[index])] = sample.buckets[index] ?? 0;
        }
        buckets["+Inf"] = sample.count;
        return {
          buckets,
          count: sample.count,
          labels: { ...sample.labels },
          sum: sample.sum
        };
      }),
      type: "histogram"
    };
  }

  reset(): void {
    this.values.clear();
  }
}

export class MetricsRegistry {
  private readonly counters = new Map<string, CounterMetric>();
  private readonly histograms = new Map<string, HistogramMetric>();

  counter(name: string, help: string): CounterMetric {
    const existing = this.counters.get(name);
    if (existing) return existing;
    const created = new CounterMetric(name, help);
    this.counters.set(name, created);
    return created;
  }

  histogram(name: string, help: string, buckets: number[] = DEFAULT_LATENCY_BUCKETS_MS): HistogramMetric {
    const existing = this.histograms.get(name);
    if (existing) return existing;
    const created = new HistogramMetric(name, help, [...buckets].sort((a, b) => a - b));
    this.histograms.set(name, created);
    return created;
  }

  snapshot(): MetricSnapshot[] {
    return [
      ...Array.from(this.counters.values()).map((metric) => metric.snapshot()),
      ...Array.from(this.histograms.values()).map((metric) => metric.snapshot())
    ].sort((left, right) => left.name.localeCompare(right.name));
  }

  renderPrometheus(): string {
    const lines: string[] = [];
    for (const metric of this.snapshot()) {
      lines.push(`# HELP ${metric.name} ${metric.help}`);
      lines.push(`# TYPE ${metric.name} ${metric.type}`);
      if (metric.type === "counter") {
        for (const sample of metric.samples) {
          lines.push(`${metric.name}${formatLabelSet(sample.labels)} ${sample.value}`);
        }
      } else {
        for (const sample of metric.samples) {
          for (const [bound, value] of Object.entries(sample.buckets)) {
            lines.push(`${metric.name}_bucket${formatLabelSet({ ...sample.labels, le: bound })} ${value}`);
          }
          lines.push(`${metric.name}_sum${formatLabelSet(sample.labels)} ${sample.sum}`);
          lines.push(`${metric.name}_count${formatLabelSet(sample.labels)} ${sample.count}`);
        }
      }
    }
    return `${lines.join("\n")}\n`;
  }

  reset(): void {
    for (const metric of this.counters.values()) metric.reset();
    for (const metric of this.histograms.values()) metric.reset();
  }
}

let defaultRegistry: MetricsRegistry | null = null;

export function metricsRegistry(): MetricsRegistry {
  if (!defaultRegistry) defaultRegistry = new MetricsRegistry();
  return defaultRegistry;
}

export function resetMetricsRegistry(): void {
  defaultRegistry?.reset();
  defaultRegistry = null;
}

export function sanitizeMetricLabel(value: unknown, { maxLength = 64 }: { maxLength?: number } = {}): string {
  const text = String(value ?? "").trim();
  if (!text) return "unknown";
  if (/bearer|token|secret|password|api[_-]?key/i.test(text)) return "redacted";
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text)) return "redacted";
  if (/(?:\+?\d[\s().-]*){10,15}/.test(text)) return "redacted";
  if (/[a-zA-Z0-9_-]{40,}/.test(text) && !/^(tenant-|bot-|src-|conn-|trc_)/.test(text)) return "redacted";
  return text.replace(/[^a-zA-Z0-9._:-]+/g, "_").slice(0, maxLength) || "unknown";
}

export const METRIC_BUCKETS = {
  counts: DEFAULT_COUNT_BUCKETS,
  latencyMs: DEFAULT_LATENCY_BUCKETS_MS,
  scores: DEFAULT_SCORE_BUCKETS
};

function normalizeLabels(labels: MetricLabels): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(labels)) {
    if (value == null || value === "") continue;
    const safeKey = sanitizeMetricLabel(key, { maxLength: 32 });
    if (safeKey === "conversation_id" || safeKey === "message" || safeKey === "text" || safeKey === "prompt") continue;
    normalized[safeKey] = sanitizeMetricLabel(value);
  }
  return normalized;
}

function labelKey(labels: Record<string, string>): string {
  return Object.keys(labels)
    .sort()
    .map((key) => `${key}=${labels[key]}`)
    .join("|");
}

function formatLabelSet(labels: Record<string, string>): string {
  const keys = Object.keys(labels).sort();
  if (!keys.length) return "";
  return `{${keys.map((key) => `${key}="${escapeLabelValue(labels[key]!)}"`).join(",")}}`;
}

function escapeLabelValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}
