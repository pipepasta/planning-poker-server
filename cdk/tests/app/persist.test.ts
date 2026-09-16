import { describe, expect, it } from "vitest";
import { persistRoom } from "../../src/app/persist";
import { createRoom, join, leave, vote } from "../../src/domain/room";
import { InMemoryRoomRepository } from "../../src/infra/inMemoryRoomRepository";

const a = { clientId: "a", connectionId: "ca", name: "A" };
const b = { clientId: "b", connectionId: "cb", name: "B" };

describe("persistRoom", () => {
    it("writes a new room with its participants", async () => {
        const repo = new InMemoryRoomRepository();
        const room = join(createRoom("r1", 0), a, 0);
        await persistRoom(repo, null, room);
        expect(await repo.getRoom("r1")).toEqual(room);
    });

    it("writes only what changed", async () => {
        const repo = new InMemoryRoomRepository();
        const before = join(join(createRoom("r1", 0), a, 0), b, 0);
        await persistRoom(repo, null, before);
        const after = (
            vote(before, "a", "5", 10) as { ok: true; value: typeof before }
        ).value;
        const calls: string[] = [];
        const spy: typeof repo = Object.assign(Object.create(repo), {
            saveParticipant: async (
                roomId: string,
                p: { clientId: string },
            ) => {
                calls.push(`p:${p.clientId}`);
                return repo.saveParticipant(roomId, p as never);
            },
            saveMeta: async (meta: never) => {
                calls.push("meta");
                return repo.saveMeta(meta);
            },
        });
        await persistRoom(spy, before, after);
        expect(calls).toEqual(["meta", "p:a"]);
    });

    it("deletes removed participants and empty rooms", async () => {
        const repo = new InMemoryRoomRepository();
        const before = join(createRoom("r1", 0), a, 0);
        await persistRoom(repo, null, before);
        await persistRoom(repo, before, leave(before, "a"));
        expect(await repo.getRoom("r1")).toBeNull();
    });
});
