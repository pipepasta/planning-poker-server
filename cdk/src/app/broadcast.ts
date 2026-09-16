import { leave, type Participant, type Room } from "../domain/room";
import type { ErrorCode, ServerMessage } from "../protocol/messages";
import type { AppContext } from "./ports";
import { toSnapshot } from "./snapshot";

const sendToAll = async (
    ctx: AppContext,
    room: Room,
    message: ServerMessage,
): Promise<Participant[]> => {
    const results = await Promise.all(
        room.participants.map(async (p) => ({
            participant: p,
            status: await ctx.broadcaster.send(p.connectionId, message),
        })),
    );
    return results.filter((r) => r.status === "gone").map((r) => r.participant);
};

const roomMessage = (ctx: AppContext, room: Room): ServerMessage => ({
    type: "room",
    serverTime: ctx.now(),
    room: toSnapshot(room),
});

export const broadcastRoom = async (
    ctx: AppContext,
    room: Room,
): Promise<Room> => {
    const gone = await sendToAll(ctx, room, roomMessage(ctx, room));
    if (gone.length === 0) return room;
    let cleaned = room;
    for (const p of gone) {
        cleaned = leave(cleaned, p.clientId);
        await ctx.repo.deleteParticipant(
            room.meta.id,
            p.clientId,
            p.connectionId,
        );
    }
    if (cleaned.participants.length === 0) {
        await ctx.repo.deleteRoom(room.meta.id);
        return cleaned;
    }
    await sendToAll(ctx, cleaned, roomMessage(ctx, cleaned));
    return cleaned;
};

export const broadcastReaction = async (
    ctx: AppContext,
    room: Room,
    emoji: string,
    from: { clientId: string; name: string },
): Promise<void> => {
    await sendToAll(ctx, room, { type: "reaction", emoji, from });
};

export const sendError = async (
    ctx: AppContext,
    connectionId: string,
    code: ErrorCode,
    message: string,
): Promise<void> => {
    await ctx.broadcaster.send(connectionId, { type: "error", code, message });
};
