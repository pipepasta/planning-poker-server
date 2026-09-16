import type { DeckId } from "../domain/deck";
import {
    changeDeck,
    createRoom,
    isMember,
    join,
    leave,
    nextRound,
    type Room,
    reveal,
    timerAction,
    vote,
} from "../domain/room";
import type { TimerActionName } from "../protocol/messages";
import { broadcastReaction, broadcastRoom, sendError } from "./broadcast";
import { persistRoom } from "./persist";
import type { AppContext } from "./ports";

export interface Actor {
    clientId: string;
    connectionId: string;
}

const commit = async (
    ctx: AppContext,
    before: Room | null,
    after: Room,
): Promise<void> => {
    await persistRoom(ctx.repo, before, after);
    if (after.participants.length > 0) await broadcastRoom(ctx, after);
};

/** Load a room the actor belongs to, or send `not_in_room` and return null. */
const loadMemberRoom = async (
    ctx: AppContext,
    actor: Actor,
    roomId: string,
): Promise<Room | null> => {
    const room = await ctx.repo.getRoom(roomId);
    if (!room || !isMember(room, actor.clientId)) {
        await sendError(
            ctx,
            actor.connectionId,
            "not_in_room",
            "Join the room first.",
        );
        return null;
    }
    return room;
};

const leaveOtherRooms = async (
    ctx: AppContext,
    actor: Actor,
    keepRoomId: string,
) => {
    const memberships = await ctx.repo.findMemberships(actor.clientId);
    for (const m of memberships) {
        if (m.roomId === keepRoomId) continue;
        const room = await ctx.repo.getRoom(m.roomId);
        if (room) await commit(ctx, room, leave(room, actor.clientId));
    }
};

export const joinRoomUsecase = async (
    ctx: AppContext,
    actor: Actor,
    input: { roomId: string; name: string },
): Promise<void> => {
    await leaveOtherRooms(ctx, actor, input.roomId);
    const before = await ctx.repo.getRoom(input.roomId);
    const base = before ?? createRoom(input.roomId, ctx.now());
    const after = join(base, { ...actor, name: input.name }, ctx.now());
    await commit(ctx, before, after);
};

export const leaveUsecase = async (
    ctx: AppContext,
    actor: Actor,
): Promise<void> => {
    const memberships = await ctx.repo.findMemberships(actor.clientId);
    for (const m of memberships) {
        if (m.connectionId !== actor.connectionId) continue;
        const room = await ctx.repo.getRoom(m.roomId);
        if (room) await commit(ctx, room, leave(room, actor.clientId));
    }
};

export const submitCardUsecase = async (
    ctx: AppContext,
    actor: Actor,
    input: { roomId: string; card: string },
): Promise<void> => {
    const room = await loadMemberRoom(ctx, actor, input.roomId);
    if (!room) return;
    const result = vote(room, actor.clientId, input.card, ctx.now());
    if (!result.ok) {
        await sendError(
            ctx,
            actor.connectionId,
            result.error,
            `Cannot vote "${input.card}".`,
        );
        return;
    }
    await commit(ctx, room, result.value);
};

export const revealUsecase = async (
    ctx: AppContext,
    actor: Actor,
    input: { roomId: string },
): Promise<void> => {
    const room = await loadMemberRoom(ctx, actor, input.roomId);
    if (room) await commit(ctx, room, reveal(room, ctx.now()));
};

export const nextRoundUsecase = async (
    ctx: AppContext,
    actor: Actor,
    input: { roomId: string },
): Promise<void> => {
    const room = await loadMemberRoom(ctx, actor, input.roomId);
    if (room) await commit(ctx, room, nextRound(room, ctx.now()));
};

export const timerUsecase = async (
    ctx: AppContext,
    actor: Actor,
    input: { roomId: string; action: TimerActionName },
): Promise<void> => {
    const room = await loadMemberRoom(ctx, actor, input.roomId);
    if (room)
        await commit(ctx, room, timerAction(room, input.action, ctx.now()));
};

export const changeDeckUsecase = async (
    ctx: AppContext,
    actor: Actor,
    input: { roomId: string; deckId: DeckId },
): Promise<void> => {
    const room = await loadMemberRoom(ctx, actor, input.roomId);
    if (room)
        await commit(ctx, room, changeDeck(room, input.deckId, ctx.now()));
};

export const reactionUsecase = async (
    ctx: AppContext,
    actor: Actor,
    input: { roomId: string; emoji: string },
): Promise<void> => {
    const room = await loadMemberRoom(ctx, actor, input.roomId);
    if (!room) return;
    const sender = room.participants.find((p) => p.clientId === actor.clientId);
    if (!sender) return;
    await broadcastReaction(ctx, room, input.emoji, {
        clientId: sender.clientId,
        name: sender.name,
    });
};
