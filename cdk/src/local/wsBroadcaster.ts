import type { Broadcaster } from "../app/ports";
import type { ServerMessage } from "../protocol/messages";

export interface SocketLike {
    readyState: number;
    send(data: string): void;
}

export class WsBroadcaster implements Broadcaster {
    private readonly sockets = new Map<string, SocketLike>();

    register(connectionId: string, socket: SocketLike): void {
        this.sockets.set(connectionId, socket);
    }

    unregister(connectionId: string): void {
        this.sockets.delete(connectionId);
    }

    async send(
        connectionId: string,
        message: ServerMessage,
    ): Promise<"ok" | "gone"> {
        const socket = this.sockets.get(connectionId);
        if (!socket || socket.readyState !== 1) return "gone";
        socket.send(JSON.stringify(message));
        return "ok";
    }
}
