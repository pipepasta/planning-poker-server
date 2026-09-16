import type { Broadcaster } from "../../src/app/ports";
import type { ServerMessage } from "../../src/protocol/messages";

export class FakeBroadcaster implements Broadcaster {
    readonly sent: Array<{ connectionId: string; message: ServerMessage }> = [];
    readonly gone = new Set<string>();

    async send(
        connectionId: string,
        message: ServerMessage,
    ): Promise<"ok" | "gone"> {
        if (this.gone.has(connectionId)) return "gone";
        this.sent.push({ connectionId, message });
        return "ok";
    }

    messagesTo(connectionId: string): ServerMessage[] {
        return this.sent
            .filter((s) => s.connectionId === connectionId)
            .map((s) => s.message);
    }
}
