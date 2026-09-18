// PARITY: this file must stay equivalent to the frontend's copy at
// planning-poker-front-nextjs/src/domain/metric.ts. The metric is room-wide
// state the server validates and broadcasts, so a one-sided edit silently
// rejects metric changes. tests/domain/metric.test.ts pins the ids and the
// default; the frontend has the same test.
export type MetricId = "average" | "mode" | "decision";

export const METRIC_IDS: readonly MetricId[] = ["average", "mode", "decision"];

export const DEFAULT_METRIC_ID: MetricId = "decision";

export const isMetricId = (value: unknown): value is MetricId =>
    typeof value === "string" &&
    (METRIC_IDS as readonly string[]).includes(value);
