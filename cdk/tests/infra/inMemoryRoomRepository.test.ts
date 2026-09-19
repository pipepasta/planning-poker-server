import { describe, expect, it } from "vitest";
import { StaleRoomError } from "../../src/app/ports";
import { createRoom } from "../../src/domain/room";
import { InMemoryRoomRepository } from "../../src/infra/inMemoryRoomRepository";

const participant = (connectionId: string) => ({
    clientId: "a",
    connectionId,
    name: "A",
    vote: null,
    joinedAt: 0,
});

describe("InMemoryRoomRepository", () => {
    it("stores meta and participants and finds memberships", async () => {
        const repo = new InMemoryRoomRepository();
        await repo.saveMeta(createRoom("r1", 0).meta, null);
        await repo.saveParticipant("r1", participant("ca"));
        expect((await repo.getRoom("r1"))?.participants).toHaveLength(1);
        expect(await repo.findMemberships("a")).toEqual([
            { roomId: "r1", connectionId: "ca" },
        ]);
        await repo.deleteParticipant("r1", "a");
        expect((await repo.getRoom("r1"))?.participants).toHaveLength(0);
        await repo.deleteRoom("r1", 0);
        expect(await repo.getRoom("r1")).toBeNull();
    });

    it("rejects a meta write that lost the race", async () => {
        const repo = new InMemoryRoomRepository();
        const meta = createRoom("r1", 0).meta;
        await repo.saveMeta(meta, null);
        await expect(repo.saveMeta(meta, null)).rejects.toBeInstanceOf(
            StaleRoomError,
        );
        await expect(repo.saveMeta(meta, 999)).rejects.toBeInstanceOf(
            StaleRoomError,
        );
        await repo.saveMeta({ ...meta, updatedAt: 5 }, 0);
        expect((await repo.getRoom("r1"))?.meta.updatedAt).toBe(5);
    });

    it("rejects deleteRoom with a stale updatedAt", async () => {
        const repo = new InMemoryRoomRepository();
        await repo.saveMeta(createRoom("r1", 7).meta, null);
        await expect(repo.deleteRoom("r1", 6)).rejects.toBeInstanceOf(
            StaleRoomError,
        );
        expect(await repo.getRoom("r1")).not.toBeNull();
        await repo.deleteRoom("r1", 7);
        expect(await repo.getRoom("r1")).toBeNull();
    });

    it("deleteParticipant with a mismatching connectionId is a no-op", async () => {
        const repo = new InMemoryRoomRepository();
        await repo.saveMeta(createRoom("r1", 0).meta, null);
        await repo.saveParticipant("r1", participant("ca-new"));

        await repo.deleteParticipant("r1", "a", "ca-old");
        expect((await repo.getRoom("r1"))?.participants).toHaveLength(1);

        await repo.deleteParticipant("r1", "a", "ca-new");
        expect((await repo.getRoom("r1"))?.participants).toHaveLength(0);
    });
});
