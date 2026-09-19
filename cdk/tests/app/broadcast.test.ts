import { describe, expect, it } from "vitest";
import { broadcastRoom, sendError } from "../../src/app/broadcast";
import { persistRoom } from "../../src/app/persist";
import { createRoom, join, vote } from "../../src/domain/room";
import { InMemoryRoomRepository } from "../../src/infra/inMemoryRoomRepository";
import { FakeBroadcaster } from "../helpers/fakeBroadcaster";

describe("broadcastRoom", () => {
    it("sends the snapshot to everyone", async () => {
        const repo = new InMemoryRoomRepository();
        const broadcaster = new FakeBroadcaster();
        const room = join(
            join(
                createRoom("r1", 0),
                { clientId: "a", connectionId: "ca", name: "A" },
                0,
            ),
            { clientId: "b", connectionId: "cb", name: "B" },
            0,
        );
        await persistRoom(repo, null, room);
        await broadcastRoom({ repo, broadcaster, now: () => 123 }, room);
        expect(broadcaster.sent.map((s) => s.connectionId)).toEqual([
            "ca",
            "cb",
        ]);
        const msg = broadcaster.sent[0].message;
        expect(msg.type === "room" && msg.serverTime).toBe(123);
        expect(
            msg.type === "room" && msg.room.participants.map((p) => p.clientId),
        ).toEqual(["a", "b"]);
    });

    it("gives each recipient their own card and nobody else's", async () => {
        const repo = new InMemoryRoomRepository();
        const broadcaster = new FakeBroadcaster();
        let room = join(
            join(
                createRoom("r1", 0),
                { clientId: "a", connectionId: "ca", name: "A" },
                0,
            ),
            { clientId: "b", connectionId: "cb", name: "B" },
            0,
        );
        room = (vote(room, "a", "8", 10) as { ok: true; value: typeof room })
            .value;
        await persistRoom(repo, null, room);

        await broadcastRoom({ repo, broadcaster, now: () => 0 }, room);

        const toA = broadcaster.messagesTo("ca")[0];
        expect(toA.type === "room" && toA.room.participants).toEqual([
            { clientId: "a", name: "A", hasVoted: true, vote: "8" },
            { clientId: "b", name: "B", hasVoted: false },
        ]);
        const toB = broadcaster.messagesTo("cb")[0];
        expect(toB.type === "room" && toB.room.participants).toEqual([
            { clientId: "a", name: "A", hasVoted: true },
            { clientId: "b", name: "B", hasVoted: false, vote: null },
        ]);
    });

    it("removes gone connections and re-sends to the rest", async () => {
        const repo = new InMemoryRoomRepository();
        const broadcaster = new FakeBroadcaster();
        broadcaster.gone.add("cb");
        const room = join(
            join(
                createRoom("r1", 0),
                { clientId: "a", connectionId: "ca", name: "A" },
                0,
            ),
            { clientId: "b", connectionId: "cb", name: "B" },
            0,
        );
        await persistRoom(repo, null, room);
        const result = await broadcastRoom(
            { repo, broadcaster, now: () => 0 },
            room,
        );
        expect(result.participants.map((p) => p.clientId)).toEqual(["a"]);
        expect(
            (await repo.getRoom("r1"))?.participants.map((p) => p.clientId),
        ).toEqual(["a"]);
        const toA = broadcaster.messagesTo("ca");
        expect(toA).toHaveLength(2);
        const last = toA[1];
        expect(
            last.type === "room" &&
                last.room.participants.map((p) => p.clientId),
        ).toEqual(["a"]);
    });

    it("keeps a participant that reconnected under a newer connectionId", async () => {
        const repo = new InMemoryRoomRepository();
        const broadcaster = new FakeBroadcaster();
        broadcaster.gone.add("cb-old");
        const room = join(
            join(
                createRoom("r1", 0),
                { clientId: "a", connectionId: "ca", name: "A" },
                0,
            ),
            { clientId: "b", connectionId: "cb-old", name: "B" },
            0,
        );
        await persistRoom(repo, null, room);
        // B reconnected after this room was loaded: the stored row is newer.
        await repo.saveParticipant("r1", {
            clientId: "b",
            connectionId: "cb-new",
            name: "B",
            vote: null,
            joinedAt: 0,
        });

        const result = await broadcastRoom(
            { repo, broadcaster, now: () => 0 },
            room,
        );

        expect(result.participants.map((p) => p.clientId)).toEqual(["a"]);
        expect(
            (await repo.getRoom("r1"))?.participants.map((p) => p.connectionId),
        ).toEqual(["ca", "cb-new"]);
    });

    it("sendError targets one connection", async () => {
        const broadcaster = new FakeBroadcaster();
        await sendError(
            { repo: new InMemoryRoomRepository(), broadcaster, now: () => 0 },
            "cx",
            "invalid_card",
            "nope",
        );
        expect(broadcaster.sent).toEqual([
            {
                connectionId: "cx",
                message: {
                    type: "error",
                    code: "invalid_card",
                    message: "nope",
                },
            },
        ]);
    });
});
