import { describe, expect, it } from "vitest";
import { dispatch } from "../../src/app/dispatch";
import { InMemoryRoomRepository } from "../../src/infra/inMemoryRoomRepository";
import { FakeBroadcaster } from "../helpers/fakeBroadcaster";

describe("dispatch", () => {
    it("routes a parsed message to the use case", async () => {
        const broadcaster = new FakeBroadcaster();
        const ctx = {
            repo: new InMemoryRoomRepository(),
            broadcaster,
            now: () => 0,
        };
        await dispatch(
            ctx,
            { clientId: "a", connectionId: "ca" },
            JSON.stringify({ action: "joinRoom", roomId: "r1", name: "Ann" }),
        );
        expect(broadcaster.sent[0].message.type).toBe("room");
    });

    it("ignores the ping heartbeat", async () => {
        const broadcaster = new FakeBroadcaster();
        const ctx = {
            repo: new InMemoryRoomRepository(),
            broadcaster,
            now: () => 0,
        };
        await dispatch(ctx, { clientId: "a", connectionId: "ca" }, "ping");
        expect(broadcaster.sent).toHaveLength(0);
    });

    it("answers invalid JSON and invalid messages with errors", async () => {
        const broadcaster = new FakeBroadcaster();
        const ctx = {
            repo: new InMemoryRoomRepository(),
            broadcaster,
            now: () => 0,
        };
        await dispatch(ctx, { clientId: "a", connectionId: "ca" }, "{nope");
        await dispatch(
            ctx,
            { clientId: "a", connectionId: "ca" },
            JSON.stringify({ action: "dance", roomId: "r1" }),
        );
        expect(
            broadcaster
                .messagesTo("ca")
                .map((m) => m.type === "error" && m.code),
        ).toEqual(["invalid_message", "invalid_message"]);
    });
});
