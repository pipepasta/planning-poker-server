import { describe, expect, it } from "vitest";
import {
    changeDeck,
    changeMetric,
    createRoom,
    isEmpty,
    join,
    leave,
    nextRound,
    reveal,
    timerAction,
    vote,
} from "../../src/domain/room";

const p = (n: number) => ({
    clientId: `c${n}`,
    connectionId: `conn${n}`,
    name: `user${n}`,
});

const twoPeople = () => join(join(createRoom("r1", 100), p(1), 100), p(2), 200);

describe("room", () => {
    it("creates a room with default deck, voting phase and running timer", () => {
        const room = createRoom("r1", 100);
        expect(room.meta).toEqual({
            id: "r1",
            deckId: "fibonacci",
            metric: "decision",
            phase: "voting",
            timer: { status: "running", startedAt: 100, accumulatedMs: 0 },
            updatedAt: 100,
        });
        expect(isEmpty(room)).toBe(true);
    });

    it("join upserts a participant by clientId and keeps their vote", () => {
        let room = twoPeople();
        room = (vote(room, "c1", "5", 300) as { ok: true; value: typeof room })
            .value;
        room = join(
            room,
            { ...p(1), connectionId: "connX", name: "renamed" },
            400,
        );
        expect(room.participants).toHaveLength(2);
        const me = room.participants.find((x) => x.clientId === "c1");
        expect(me).toMatchObject({
            connectionId: "connX",
            name: "renamed",
            vote: "5",
            joinedAt: 100,
        });
    });

    it("join bumps updatedAt for a newcomer but not for a re-join", () => {
        const room = twoPeople();
        expect(room.meta.updatedAt).toBe(200);
        const rejoined = join(room, { ...p(2), connectionId: "connY" }, 500);
        expect(rejoined.meta.updatedAt).toBe(200);
    });

    it("leave removes the participant", () => {
        const room = leave(twoPeople(), "c1");
        expect(room.participants.map((x) => x.clientId)).toEqual(["c2"]);
    });

    it("vote records the card, rejects strangers and cards outside the deck", () => {
        const room = twoPeople();
        expect(vote(room, "nobody", "5", 300)).toEqual({
            ok: false,
            error: "not_in_room",
        });
        expect(vote(room, "c1", "XL", 300)).toEqual({
            ok: false,
            error: "invalid_card",
        });
        const r = vote(room, "c1", "skip", 300);
        expect(r.ok && r.value.participants[0].vote).toBe("skip");
        expect(r.ok && r.value.meta.phase).toBe("voting");
    });

    it("auto-reveals when everyone has voted", () => {
        let room = twoPeople();
        room = (vote(room, "c1", "3", 300) as { ok: true; value: typeof room })
            .value;
        room = (vote(room, "c2", "5", 400) as { ok: true; value: typeof room })
            .value;
        expect(room.meta.phase).toBe("revealed");
        expect(room.meta.updatedAt).toBe(400);
    });

    it("reveal fills missing votes with skip", () => {
        let room = twoPeople();
        room = (vote(room, "c1", "3", 300) as { ok: true; value: typeof room })
            .value;
        room = reveal(room, 500);
        expect(room.meta.phase).toBe("revealed");
        expect(room.participants.map((x) => x.vote)).toEqual(["3", "skip"]);
    });

    it("keeps the revealed phase when someone changes their card", () => {
        const revealed = reveal(twoPeople(), 500);
        const changed = vote(revealed, "c1", "8", 600);
        expect(changed.ok && changed.value.meta.phase).toBe("revealed");
        expect(changed.ok && changed.value.participants[0].vote).toBe("8");
    });

    it("nextRound clears votes, returns to voting and restarts the timer", () => {
        let room = reveal(twoPeople(), 500);
        room = nextRound(room, 900);
        expect(room.meta.phase).toBe("voting");
        expect(room.participants.every((x) => x.vote === null)).toBe(true);
        expect(room.meta.timer).toEqual({
            status: "running",
            startedAt: 900,
            accumulatedMs: 0,
        });
    });

    it("changeDeck clears votes and phase but not the timer", () => {
        let room = reveal(twoPeople(), 500);
        room = changeDeck(room, "tshirt", 900);
        expect(room.meta.deckId).toBe("tshirt");
        expect(room.meta.phase).toBe("voting");
        expect(room.participants.every((x) => x.vote === null)).toBe(true);
        expect(room.meta.timer.startedAt).toBe(100);
    });

    it("changeMetric updates the meta and keeps every vote and the phase", () => {
        let room = twoPeople();
        room = (vote(room, "c1", "3", 300) as { ok: true; value: typeof room })
            .value;
        room = reveal(room, 500);
        const changed = changeMetric(room, "average", 900);
        expect(changed.meta.metric).toBe("average");
        expect(changed.meta.phase).toBe("revealed");
        expect(changed.participants.map((x) => x.vote)).toEqual(["3", "skip"]);
        expect(changed.meta.deckId).toBe("fibonacci");
        expect(changed.meta.timer).toEqual(room.meta.timer);
        // The optimistic lock serialises on updatedAt, so it still has to move.
        expect(changed.meta.updatedAt).toBe(900);
    });

    it("timerAction pauses, resumes and resets", () => {
        const room = twoPeople();
        const paused = timerAction(room, "pauseTimer", 1100);
        expect(paused.meta.timer).toEqual({
            status: "paused",
            startedAt: null,
            accumulatedMs: 1000,
        });
        const resumed = timerAction(paused, "resumeTimer", 2000);
        expect(resumed.meta.timer).toEqual({
            status: "running",
            startedAt: 2000,
            accumulatedMs: 1000,
        });
        const reset = timerAction(resumed, "resetTimer", 3000);
        expect(reset.meta.timer).toEqual({
            status: "running",
            startedAt: 3000,
            accumulatedMs: 0,
        });
    });
});
