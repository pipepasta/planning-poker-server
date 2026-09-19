import { describe, expect, it } from "vitest";
import {
    DEFAULT_METRIC_ID,
    isMetricId,
    METRIC_IDS,
} from "../../src/domain/metric";

// Drift guard: these values are duplicated in
// planning-poker-front-nextjs/src/domain/metric.ts. Changing them here without
// changing them there makes the frontend reject snapshots or send metrics the
// server refuses, so this test is deliberately exact.
describe("metric (frontend parity)", () => {
    it("pins the metric ids", () => {
        expect(METRIC_IDS).toEqual(["average", "mode", "decision"]);
    });

    it("defaults to the scrum decision", () => {
        expect(DEFAULT_METRIC_ID).toBe("decision");
    });

    it("recognises metric ids", () => {
        expect(isMetricId("average")).toBe(true);
        expect(isMetricId("mode")).toBe(true);
        expect(isMetricId("decision")).toBe(true);
        expect(isMetricId("median")).toBe(false);
        expect(isMetricId(3)).toBe(false);
        expect(isMetricId(undefined)).toBe(false);
    });
});
