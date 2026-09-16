import { describe, expect, it } from "vitest";
import { toSnapshot } from "../../src/app/snapshot";
import { createRoom, join, reveal, vote } from "../../src/domain/room";

const base = () => {
    let room = join(
        createRoom("r1", 0),
        { clientId: "a", connectionId: "ca", name: "A" },
        0,
    );
    room = join(room, { clientId: "b", connectionId: "cb", name: "B" }, 0);
    return (vote(room, "a", "8", 10) as { ok: true; value: typeof room }).value;
};

describe("toSnapshot", () => {
    it("hides votes while voting", () => {
        const s = toSnapshot(base());
        expect(s.phase).toBe("voting");
        expect(s.participants).toEqual([
            { clientId: "a", name: "A", hasVoted: true },
            { clientId: "b", name: "B", hasVoted: false },
        ]);
        expect(JSON.stringify(s)).not.toContain('"vote"');
    });

    it("shows a voter their own card while voting", () => {
        const s = toSnapshot(base(), "a");
        expect(s.participants).toEqual([
            { clientId: "a", name: "A", hasVoted: true, vote: "8" },
            { clientId: "b", name: "B", hasVoted: false },
        ]);
    });

    it("includes votes once revealed", () => {
        const s = toSnapshot(reveal(base(), 20));
        expect(s.participants).toEqual([
            { clientId: "a", name: "A", hasVoted: true, vote: "8" },
            { clientId: "b", name: "B", hasVoted: true, vote: "skip" },
        ]);
        expect(s.timer).toEqual({
            status: "running",
            startedAt: 0,
            accumulatedMs: 0,
        });
        expect(s.deckId).toBe("fibonacci");
    });
});
