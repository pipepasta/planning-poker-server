import { describe, expect, it } from "vitest";
import { persistRoom } from "../../src/app/persist";
import { createRoom, join, leave, vote } from "../../src/domain/room";
import { InMemoryRoomRepository } from "../../src/infra/inMemoryRoomRepository";

/** Wraps a repository so every write it receives is recorded in order. */
const recording = (repo: InMemoryRoomRepository) => {
    const calls: string[] = [];
    const spy: InMemoryRoomRepository = Object.assign(Object.create(repo), {
        saveMeta: async (meta: never, expected: number | null) => {
            calls.push("meta");
            return repo.saveMeta(meta, expected);
        },
        saveParticipant: async (roomId: string, p: { clientId: string }) => {
            calls.push(`save:${p.clientId}`);
            return repo.saveParticipant(roomId, p as never);
        },
        deleteParticipant: async (
            roomId: string,
            clientId: string,
            expected?: string,
        ) => {
            calls.push(`delete:${clientId}:${expected}`);
            return repo.deleteParticipant(roomId, clientId, expected);
        },
    });
    return { spy, calls };
};

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
        const { spy, calls } = recording(repo);
        await persistRoom(spy, before, after);
        expect(calls).toEqual(["meta", "save:a"]);
    });

    it("removes one participant and leaves the meta alone", async () => {
        const repo = new InMemoryRoomRepository();
        const before = join(join(createRoom("r1", 0), a, 0), b, 0);
        await persistRoom(repo, null, before);
        const { spy, calls } = recording(repo);

        await persistRoom(spy, before, leave(before, "b"));

        expect(calls).toEqual(["delete:b:cb"]);
        expect(
            (await repo.getRoom("r1"))?.participants.map((p) => p.clientId),
        ).toEqual(["a"]);
    });

    it("writes only the renamed participant", async () => {
        const repo = new InMemoryRoomRepository();
        const before = join(join(createRoom("r1", 0), a, 0), b, 0);
        await persistRoom(repo, null, before);
        const { spy, calls } = recording(repo);

        await persistRoom(spy, before, join(before, { ...a, name: "A2" }, 50));

        expect(calls).toEqual(["save:a"]);
        expect(
            (await repo.getRoom("r1"))?.participants.map((p) => p.name),
        ).toEqual(["A2", "B"]);
    });

    it("deletes removed participants and empty rooms", async () => {
        const repo = new InMemoryRoomRepository();
        const before = join(createRoom("r1", 0), a, 0);
        await persistRoom(repo, null, before);
        await persistRoom(repo, before, leave(before, "a"));
        expect(await repo.getRoom("r1")).toBeNull();
    });
});
