import { randomUUID } from "node:crypto";
import { WebSocketServer } from "ws";
import { dispatch } from "../app/dispatch";
import type { AppContext } from "../app/ports";
import { type Actor, leaveUsecase } from "../app/usecases";
import { InMemoryRoomRepository } from "../infra/inMemoryRoomRepository";
import { WsBroadcaster } from "./wsBroadcaster";

const port = Number(process.env.PORT ?? 8787);
const broadcaster = new WsBroadcaster();
const ctx: AppContext = {
    repo: new InMemoryRoomRepository(),
    broadcaster,
    now: () => Date.now(),
};

const subFromToken = (token: string | null): string | null => {
    if (!token) return null;
    const parts = token.split(".");
    if (parts.length < 2) return null;
    try {
        const payload = JSON.parse(
            Buffer.from(parts[1], "base64url").toString("utf8"),
        );
        return typeof payload.sub === "string" ? payload.sub : null;
    } catch {
        return null;
    }
};

const wss = new WebSocketServer({ port });
console.log(`local planning poker server listening on ws://localhost:${port}`);

wss.on("connection", (socket, request) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    const actor: Actor = {
        clientId:
            subFromToken(url.searchParams.get("token")) ??
            `local-${randomUUID().slice(0, 8)}`,
        connectionId: randomUUID(),
    };
    broadcaster.register(actor.connectionId, socket);
    console.log("connect", actor);

    socket.on("message", async (data) => {
        const text = data.toString();
        if (text === "ping") {
            socket.send("pong");
            return;
        }
        console.log("recv", actor.clientId, text);
        await dispatch(ctx, actor, text);
    });

    socket.on("close", async () => {
        console.log("close", actor);
        broadcaster.unregister(actor.connectionId);
        await leaveUsecase(ctx, actor);
    });
});
