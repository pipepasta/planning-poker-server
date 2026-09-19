export interface TimerState {
    readonly status: "running" | "paused";
    readonly startedAt: number | null;
    readonly accumulatedMs: number;
}

export const startTimer = (now: number): TimerState => ({
    status: "running",
    startedAt: now,
    accumulatedMs: 0,
});

export const elapsedMs = (timer: TimerState, now: number): number =>
    timer.accumulatedMs +
    (timer.status === "running" && timer.startedAt !== null
        ? Math.max(0, now - timer.startedAt)
        : 0);

export const pauseTimer = (timer: TimerState, now: number): TimerState =>
    timer.status === "paused"
        ? timer
        : {
              status: "paused",
              startedAt: null,
              accumulatedMs: elapsedMs(timer, now),
          };

export const resumeTimer = (timer: TimerState, now: number): TimerState =>
    timer.status === "running"
        ? timer
        : {
              status: "running",
              startedAt: now,
              accumulatedMs: timer.accumulatedMs,
          };
