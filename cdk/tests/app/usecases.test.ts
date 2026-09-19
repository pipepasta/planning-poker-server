import { beforeEach, describe, expect, it } from "vitest";
import { type AppContext, StaleRoomError } from "../../src/app/ports";
import {
    changeDeckUsecase,
    changeMetricUsecase,
    joinRoomUsecase,
    leaveUsecase,
    nextRoundUsecase,
    reactionUsecase,
    revealUsecase,
    submitCardUsecase,
    timerUsecase,
} from "../../src/app/usecases";
import type { Room } from "../../src/domain/room";
import { InMemoryRoomRepository } from "../../src/infra/inMemoryRoomRepository";
import { FakeBroadcaster } from "../helpers/fakeBroadcaster";

const A = { clientId: "a", connectionId: "ca" };
const B = { clientId: "b", connectionId: "cb" };

let repo: InMemoryRoomRepository;
let broadcaster: FakeBroadcaster;
let ctx: AppContext;
let clock = 1000;

beforeEach(() => {
    repo = new InMemoryRoomRepository();
    broadcaster = new FakeBroadcaster();
    clock = 1000;
    ctx = { repo, broadcaster, now: () => clock };
});

const lastRoomMessageTo = (connectionId: string) => {
    const msgs = broadcaster
        .messagesTo(connectionId)
        .filter((m) => m.type === "room");
    const last = msgs[msgs.length - 1];
    if (!last || last.type !== "room") throw new Error("no room message");
    return last;
};

describe("joinRoomUsecase", () => {
    it("creates the room on first join and broadcasts", async () => {
        await joinRoomUsecase(ctx, A, { roomId: "r1", name: "Ann" });
        const msg = lastRoomMessageTo("ca");
        expect(msg.room.participants).toEqual([
            { clientId: "a", name: "Ann", hasVoted: false, vote: null },
        ]);
        expect(msg.room.timer).toEqual({
            status: "running",
            startedAt: 1000,
            accumulatedMs: 0,
        });
    });

    it("moves a user out of their previous room", async () => {
        await joinRoomUsecase(ctx, A, { roomId: "r1", name: "Ann" });
        await joinRoomUsecase(ctx, B, { roomId: "r1", name: "Bob" });
        await joinRoomUsecase(ctx, A, { roomId: "r2", name: "Ann" });
        expect(
            (await repo.getRoom("r1"))?.participants.map((p) => p.clientId),
        ).toEqual(["b"]);
        expect(
            (await repo.getRoom("r2"))?.participants.map((p) => p.clientId),
        ).toEqual(["a"]);
        expect(
            lastRoomMessageTo("cb").room.participants.map((p) => p.clientId),
        ).toEqual(["b"]);
    });

    it("re-join keeps the vote and moves the snapshot to the new connection", async () => {
        await joinRoomUsecase(ctx, A, { roomId: "r1", name: "Ann" });
        await submitCardUsecase(ctx, A, { roomId: "r1", card: "5" });
        const beforeRejoin = broadcaster.messagesTo("ca").length;

        clock = 2000;
        await joinRoomUsecase(
            ctx,
            { clientId: "a", connectionId: "ca2" },
            { roomId: "r1", name: "Ann" },
        );

        expect((await repo.getRoom("r1"))?.participants).toEqual([
            {
                clientId: "a",
                connectionId: "ca2",
                name: "Ann",
                vote: "5",
                joinedAt: 1000,
            },
        ]);
        expect(broadcaster.messagesTo("ca")).toHaveLength(beforeRejoin);
        expect(lastRoomMessageTo("ca2").room.participants).toEqual([
            { clientId: "a", name: "Ann", hasVoted: true, vote: "5" },
        ]);
    });
});

describe("leaveUsecase", () => {
    it("removes the participant only when the connection matches", async () => {
        await joinRoomUsecase(ctx, A, { roomId: "r1", name: "Ann" });
        await joinRoomUsecase(ctx, B, { roomId: "r1", name: "Bob" });
        await leaveUsecase(ctx, { clientId: "a", connectionId: "stale" });
        expect((await repo.getRoom("r1"))?.participants).toHaveLength(2);
        await leaveUsecase(ctx, A);
        expect(
            (await repo.getRoom("r1"))?.participants.map((p) => p.clientId),
        ).toEqual(["b"]);
        await leaveUsecase(ctx, B);
        expect(await repo.getRoom("r1")).toBeNull();
    });
});

describe("voting flow", () => {
    beforeEach(async () => {
        await joinRoomUsecase(ctx, A, { roomId: "r1", name: "Ann" });
        await joinRoomUsecase(ctx, B, { roomId: "r1", name: "Bob" });
    });

    it("hides votes until everyone voted, then reveals", async () => {
        await submitCardUsecase(ctx, A, { roomId: "r1", card: "5" });
        // Bob sees that Ann voted but not what she played; his own card is his.
        expect(lastRoomMessageTo("cb").room.participants).toEqual([
            { clientId: "a", name: "Ann", hasVoted: true },
            { clientId: "b", name: "Bob", hasVoted: false, vote: null },
        ]);
        await submitCardUsecase(ctx, B, { roomId: "r1", card: "8" });
        const msg = lastRoomMessageTo("ca");
        expect(msg.room.phase).toBe("revealed");
        expect(msg.room.participants.map((p) => p.vote)).toEqual(["5", "8"]);
    });

    it("broadcasts a changed card immediately while revealed", async () => {
        await submitCardUsecase(ctx, A, { roomId: "r1", card: "5" });
        await submitCardUsecase(ctx, B, { roomId: "r1", card: "8" });

        clock = 4000;
        await submitCardUsecase(ctx, A, { roomId: "r1", card: "13" });

        const msg = lastRoomMessageTo("cb");
        expect(msg.room.phase).toBe("revealed");
        expect(msg.room.participants.map((p) => p.vote)).toEqual(["13", "8"]);
        expect((await repo.getRoom("r1"))?.meta.phase).toBe("revealed");
    });

    it("rejects invalid cards and strangers with errors", async () => {
        await submitCardUsecase(ctx, A, { roomId: "r1", card: "XL" });
        expect(broadcaster.messagesTo("ca").at(-1)).toMatchObject({
            type: "error",
            code: "invalid_card",
        });
        await submitCardUsecase(
            ctx,
            { clientId: "z", connectionId: "cz" },
            { roomId: "r1", card: "5" },
        );
        expect(broadcaster.messagesTo("cz")).toEqual([
            { type: "error", code: "not_in_room", message: expect.any(String) },
        ]);
    });

    it("reveal, next round, change deck and timer actions", async () => {
        await submitCardUsecase(ctx, A, { roomId: "r1", card: "5" });
        await revealUsecase(ctx, B, { roomId: "r1" });
        expect(
            lastRoomMessageTo("ca").room.participants.map((p) => p.vote),
        ).toEqual(["5", "skip"]);

        clock = 5000;
        await nextRoundUsecase(ctx, A, { roomId: "r1" });
        let msg = lastRoomMessageTo("ca");
        expect(msg.room.phase).toBe("voting");
        expect(msg.room.timer.startedAt).toBe(5000);

        await changeDeckUsecase(ctx, A, { roomId: "r1", deckId: "tshirt" });
        msg = lastRoomMessageTo("cb");
        expect(msg.room.deckId).toBe("tshirt");

        clock = 6000;
        await timerUsecase(ctx, A, { roomId: "r1", action: "pauseTimer" });
        expect(lastRoomMessageTo("cb").room.timer).toEqual({
            status: "paused",
            startedAt: null,
            accumulatedMs: 1000,
        });
    });

    it("changeMetric reaches everyone without losing a vote or the reveal", async () => {
        await submitCardUsecase(ctx, A, { roomId: "r1", card: "5" });
        await submitCardUsecase(ctx, B, { roomId: "r1", card: "8" });
        expect(lastRoomMessageTo("ca").room.metric).toBe("decision");

        clock = 7000;
        await changeMetricUsecase(ctx, B, { roomId: "r1", metric: "average" });

        for (const connectionId of ["ca", "cb"]) {
            const msg = lastRoomMessageTo(connectionId);
            expect(msg.room.metric).toBe("average");
            expect(msg.room.phase).toBe("revealed");
            expect(msg.room.participants.map((p) => p.vote)).toEqual([
                "5",
                "8",
            ]);
        }
        const stored = await repo.getRoom("r1");
        expect(stored?.meta.metric).toBe("average");
        expect(stored?.meta.phase).toBe("revealed");
        expect(stored?.participants.map((p) => p.vote)).toEqual(["5", "8"]);
    });

    it("reaction is broadcast with the sender name", async () => {
        await reactionUsecase(ctx, A, { roomId: "r1", emoji: "👍" });
        expect(broadcaster.messagesTo("cb").at(-1)).toEqual({
            type: "reaction",
            emoji: "👍",
            from: { clientId: "a", name: "Ann" },
        });
    });
});

/**
 * Hands out `stale` for the first `getRoom`, then the real state: the shape a
 * concurrent writer produces between our read and our conditional write.
 */
const staleOnce = (
    repo: InMemoryRoomRepository,
    stale: Room,
): InMemoryRoomRepository => {
    let served = false;
    return Object.assign(Object.create(repo), {
        getRoom: async (roomId: string) => {
            if (served) return repo.getRoom(roomId);
            served = true;
            return stale;
        },
    });
};

describe("concurrent updates", () => {
    beforeEach(async () => {
        await joinRoomUsecase(ctx, A, { roomId: "r1", name: "Ann" });
        await joinRoomUsecase(ctx, B, { roomId: "r1", name: "Bob" });
    });

    it("retries a vote that raced the other last vote and still reveals", async () => {
        const stale = await repo.getRoom("r1");
        if (!stale) throw new Error("no room");

        clock = 2000;
        await submitCardUsecase(ctx, B, { roomId: "r1", card: "8" });

        clock = 3000;
        await submitCardUsecase({ ...ctx, repo: staleOnce(repo, stale) }, A, {
            roomId: "r1",
            card: "5",
        });

        const stored = await repo.getRoom("r1");
        expect(stored?.meta.phase).toBe("revealed");
        expect(stored?.participants.map((p) => p.vote)).toEqual(["5", "8"]);
        const msg = lastRoomMessageTo("ca");
        expect(msg.room.phase).toBe("revealed");
        expect(msg.room.participants.map((p) => p.vote)).toEqual(["5", "8"]);
    });

    it("keeps a concurrent pause when the vote is retried", async () => {
        const stale = await repo.getRoom("r1");
        if (!stale) throw new Error("no room");

        clock = 2000;
        await timerUsecase(ctx, B, { roomId: "r1", action: "pauseTimer" });

        clock = 3000;
        await submitCardUsecase({ ...ctx, repo: staleOnce(repo, stale) }, A, {
            roomId: "r1",
            card: "5",
        });

        const stored = await repo.getRoom("r1");
        expect(stored?.meta.timer.status).toBe("paused");
        expect(stored?.participants.find((p) => p.clientId === "a")?.vote).toBe(
            "5",
        );
    });

    it("gives up with an internal error after repeated conflicts", async () => {
        const alwaysStale: InMemoryRoomRepository = Object.assign(
            Object.create(repo),
            {
                saveMeta: async () => {
                    throw new StaleRoomError("r1");
                },
            },
        );
        clock = 2000;
        await submitCardUsecase({ ...ctx, repo: alwaysStale }, A, {
            roomId: "r1",
            card: "5",
        });
        expect(broadcaster.messagesTo("ca").at(-1)).toMatchObject({
            type: "error",
            code: "internal",
        });
    });

    it("deletes an orphaned membership row when the room is gone", async () => {
        const deleted: unknown[][] = [];
        const orphaned: InMemoryRoomRepository = Object.assign(
            Object.create(repo),
            {
                findMemberships: async () => [
                    { roomId: "r9", connectionId: "ca" },
                ],
                getRoom: async () => null,
                deleteParticipant: async (...args: unknown[]) => {
                    deleted.push(args);
                },
            },
        );
        await leaveUsecase({ ...ctx, repo: orphaned }, A);
        expect(deleted).toEqual([["r9", "a", "ca"]]);
    });
});
