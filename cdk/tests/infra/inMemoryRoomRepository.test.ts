import { describe, expect, it } from "vitest";
import { createRoom } from "../../src/domain/room";
import { InMemoryRoomRepository } from "../../src/infra/inMemoryRoomRepository";

describe("InMemoryRoomRepository", () => {
    it("stores meta and participants and finds memberships", async () => {
        const repo = new InMemoryRoomRepository();
        await repo.saveMeta(createRoom("r1", 0).meta);
        await repo.saveParticipant("r1", {
            clientId: "a",
            connectionId: "ca",
            name: "A",
            vote: null,
            joinedAt: 0,
        });
        expect((await repo.getRoom("r1"))?.participants).toHaveLength(1);
        expect(await repo.findMemberships("a")).toEqual([
            { roomId: "r1", connectionId: "ca" },
        ]);
        await repo.deleteParticipant("r1", "a");
        expect((await repo.getRoom("r1"))?.participants).toHaveLength(0);
        await repo.deleteRoom("r1");
        expect(await repo.getRoom("r1")).toBeNull();
    });
});
