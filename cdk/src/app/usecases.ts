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
import type { ErrorCode, TimerActionName } from "../protocol/messages";
import { broadcastReaction, broadcastRoom, sendError } from "./broadcast";
import { persistRoom } from "./persist";
import { type AppContext, type Membership, StaleRoomError } from "./ports";

export interface Actor {
    clientId: string;
    connectionId: string;
}

/** How many times a transition is re-applied to freshly loaded state. */
const MAX_COMMIT_ATTEMPTS = 3;

interface TransitionError {
    error: ErrorCode;
    message: string;
}

/** A pure step from the loaded room to the room that should be stored. */
type Transition = (room: Room | null) => Room | TransitionError;

const NOT_IN_ROOM: TransitionError = {
    error: "not_in_room",
    message: "Join the room first.",
};

const isTransitionError = (
    result: Room | TransitionError,
): result is TransitionError => "error" in result;

/** Restricts a transition to members; anyone else gets `not_in_room`. */
const byMember =
    (actor: Actor, fn: (room: Room) => Room | TransitionError): Transition =>
    (room) =>
        room && isMember(room, actor.clientId) ? fn(room) : NOT_IN_ROOM;

/**
 * Loads the room, applies `transition`, persists and broadcasts the result.
 * Conditional writes make a concurrent update fail with {@link StaleRoomError};
 * the transition is then re-applied to freshly loaded state.
 */
const runTransition = async (
    ctx: AppContext,
    actor: Actor,
    roomId: string,
    transition: Transition,
    onMissing?: () => Promise<void>,
): Promise<void> => {
    for (let attempt = 1; attempt <= MAX_COMMIT_ATTEMPTS; attempt++) {
        const before = await ctx.repo.getRoom(roomId);
        if (before === null && onMissing) return await onMissing();
        const after = transition(before);
        if (isTransitionError(after)) {
            await sendError(
                ctx,
                actor.connectionId,
                after.error,
                after.message,
            );
            return;
        }
        try {
            await persistRoom(ctx.repo, before, after);
            if (after.participants.length > 0) await broadcastRoom(ctx, after);
            return;
        } catch (error) {
            if (!(error instanceof StaleRoomError)) throw error;
        }
    }
    console.error({
        message: "gave up after concurrent room updates",
        roomId,
        clientId: actor.clientId,
        attempts: MAX_COMMIT_ATTEMPTS,
    });
    await sendError(
        ctx,
        actor.connectionId,
        "internal",
        "Something went wrong.",
    );
};

/**
 * Drops the actor from one room. When the room is already gone, the membership
 * row is an orphan left by a partial delete, so remove it directly.
 */
const leaveMembership = (
    ctx: AppContext,
    actor: Actor,
    membership: Membership,
): Promise<void> =>
    runTransition(
        ctx,
        actor,
        membership.roomId,
        (room) => (room ? leave(room, actor.clientId) : NOT_IN_ROOM),
        () =>
            ctx.repo.deleteParticipant(
                membership.roomId,
                actor.clientId,
                membership.connectionId,
            ),
    );

const leaveOtherRooms = async (
    ctx: AppContext,
    actor: Actor,
    keepRoomId: string,
): Promise<void> => {
    const memberships = await ctx.repo.findMemberships(actor.clientId);
    for (const m of memberships) {
        if (m.roomId === keepRoomId) continue;
        await leaveMembership(ctx, actor, m);
    }
};

export const joinRoomUsecase = async (
    ctx: AppContext,
    actor: Actor,
    input: { roomId: string; name: string },
): Promise<void> => {
    await leaveOtherRooms(ctx, actor, input.roomId);
    await runTransition(ctx, actor, input.roomId, (room) =>
        join(
            room ?? createRoom(input.roomId, ctx.now()),
            { ...actor, name: input.name },
            ctx.now(),
        ),
    );
};

export const leaveUsecase = async (
    ctx: AppContext,
    actor: Actor,
): Promise<void> => {
    const memberships = await ctx.repo.findMemberships(actor.clientId);
    for (const m of memberships) {
        if (m.connectionId !== actor.connectionId) continue;
        await leaveMembership(ctx, actor, m);
    }
};

export const submitCardUsecase = (
    ctx: AppContext,
    actor: Actor,
    input: { roomId: string; card: string },
): Promise<void> =>
    runTransition(
        ctx,
        actor,
        input.roomId,
        byMember(actor, (room) => {
            const result = vote(room, actor.clientId, input.card, ctx.now());
            return result.ok
                ? result.value
                : {
                      error: result.error,
                      message: `Cannot vote "${input.card}".`,
                  };
        }),
    );

export const revealUsecase = (
    ctx: AppContext,
    actor: Actor,
    input: { roomId: string },
): Promise<void> =>
    runTransition(
        ctx,
        actor,
        input.roomId,
        byMember(actor, (room) => reveal(room, ctx.now())),
    );

export const nextRoundUsecase = (
    ctx: AppContext,
    actor: Actor,
    input: { roomId: string },
): Promise<void> =>
    runTransition(
        ctx,
        actor,
        input.roomId,
        byMember(actor, (room) => nextRound(room, ctx.now())),
    );

export const timerUsecase = (
    ctx: AppContext,
    actor: Actor,
    input: { roomId: string; action: TimerActionName },
): Promise<void> =>
    runTransition(
        ctx,
        actor,
        input.roomId,
        byMember(actor, (room) => timerAction(room, input.action, ctx.now())),
    );

export const changeDeckUsecase = (
    ctx: AppContext,
    actor: Actor,
    input: { roomId: string; deckId: DeckId },
): Promise<void> =>
    runTransition(
        ctx,
        actor,
        input.roomId,
        byMember(actor, (room) => changeDeck(room, input.deckId, ctx.now())),
    );

export const reactionUsecase = async (
    ctx: AppContext,
    actor: Actor,
    input: { roomId: string; emoji: string },
): Promise<void> => {
    const room = await ctx.repo.getRoom(input.roomId);
    const sender = room?.participants.find(
        (p) => p.clientId === actor.clientId,
    );
    if (!room || !sender) {
        await sendError(
            ctx,
            actor.connectionId,
            NOT_IN_ROOM.error,
            NOT_IN_ROOM.message,
        );
        return;
    }
    await broadcastReaction(ctx, room, input.emoji, {
        clientId: sender.clientId,
        name: sender.name,
    });
};
