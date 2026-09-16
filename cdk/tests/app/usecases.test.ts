import { beforeEach, describe, expect, it } from "vitest";
import type { AppContext } from "../../src/app/ports";
import {
    changeDeckUsecase,
    joinRoomUsecase,
    leaveUsecase,
    nextRoundUsecase,
    reactionUsecase,
    revealUsecase,
    submitCardUsecase,
    timerUsecase,
} from "../../src/app/usecases";
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
            { clientId: "a", name: "Ann", hasVoted: false },
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
        expect(lastRoomMessageTo("cb").room.participants).toEqual([
            { clientId: "a", name: "Ann", hasVoted: true },
            { clientId: "b", name: "Bob", hasVoted: false },
        ]);
        await submitCardUsecase(ctx, B, { roomId: "r1", card: "8" });
        const msg = lastRoomMessageTo("ca");
        expect(msg.room.phase).toBe("revealed");
        expect(msg.room.participants.map((p) => p.vote)).toEqual(["5", "8"]);
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

    it("reaction is broadcast with the sender name", async () => {
        await reactionUsecase(ctx, A, { roomId: "r1", emoji: "👍" });
        expect(broadcaster.messagesTo("cb").at(-1)).toEqual({
            type: "reaction",
            emoji: "👍",
            from: { clientId: "a", name: "Ann" },
        });
    });
});
