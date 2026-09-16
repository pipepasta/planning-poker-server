import { describe, expect, it } from "vitest";
import { makeHandler } from "../../src/functions/default/index";
import { InMemoryRoomRepository } from "../../src/infra/inMemoryRoomRepository";
import { FakeBroadcaster } from "../helpers/fakeBroadcaster";

const event = (body: unknown, authorizer?: { userId: string }) =>
    ({
        body: JSON.stringify(body),
        requestContext: {
            connectionId: "ca",
            routeKey: "joinRoom",
            authorizer,
        },
    }) as never;

describe("default handler", () => {
    it("returns 401 without authorizer context", async () => {
        const handler = makeHandler({
            repo: new InMemoryRoomRepository(),
            broadcaster: new FakeBroadcaster(),
            now: () => 0,
        });
        const res = await handler(
            event({ action: "joinRoom", roomId: "r1", name: "A" }),
        );
        expect(res).toMatchObject({ statusCode: 401 });
    });

    it("dispatches and returns 200", async () => {
        const broadcaster = new FakeBroadcaster();
        const handler = makeHandler({
            repo: new InMemoryRoomRepository(),
            broadcaster,
            now: () => 0,
        });
        const res = await handler(
            event(
                { action: "joinRoom", roomId: "r1", name: "A" },
                { userId: "a" },
            ),
        );
        expect(res).toMatchObject({ statusCode: 200 });
        expect(broadcaster.sent[0].message.type).toBe("room");
    });
});
