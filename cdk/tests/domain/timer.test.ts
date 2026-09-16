import { describe, expect, it } from "vitest";
import {
    elapsedMs,
    pauseTimer,
    resumeTimer,
    startTimer,
} from "../../src/domain/timer";

describe("timer", () => {
    it("starts running from zero", () => {
        const t = startTimer(1000);
        expect(t).toEqual({
            status: "running",
            startedAt: 1000,
            accumulatedMs: 0,
        });
        expect(elapsedMs(t, 4000)).toBe(3000);
    });

    it("pauses and keeps elapsed time", () => {
        const t = pauseTimer(startTimer(1000), 3500);
        expect(t).toEqual({
            status: "paused",
            startedAt: null,
            accumulatedMs: 2500,
        });
        expect(elapsedMs(t, 99999)).toBe(2500);
    });

    it("resumes from accumulated time", () => {
        const t = resumeTimer(pauseTimer(startTimer(1000), 3500), 10000);
        expect(t).toEqual({
            status: "running",
            startedAt: 10000,
            accumulatedMs: 2500,
        });
        expect(elapsedMs(t, 11000)).toBe(3500);
    });

    it("pause when paused and resume when running are no-ops", () => {
        const paused = pauseTimer(startTimer(0), 10);
        expect(pauseTimer(paused, 50)).toEqual(paused);
        const running = startTimer(0);
        expect(resumeTimer(running, 50)).toEqual(running);
    });
});
