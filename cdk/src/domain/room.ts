import {
    DECKS,
    DEFAULT_DECK_ID,
    type DeckId,
    isCardInDeck,
    SKIP_CARD,
} from "./deck";
import { pauseTimer, resumeTimer, startTimer, type TimerState } from "./timer";

export type Phase = "voting" | "revealed";

export interface Participant {
    readonly clientId: string;
    readonly connectionId: string;
    readonly name: string;
    readonly vote: string | null;
    readonly joinedAt: number;
}

export interface RoomMeta {
    readonly id: string;
    readonly deckId: DeckId;
    readonly phase: Phase;
    readonly timer: TimerState;
    readonly updatedAt: number;
}

export interface Room {
    readonly meta: RoomMeta;
    readonly participants: readonly Participant[];
}

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export const createRoom = (id: string, now: number): Room => ({
    meta: {
        id,
        deckId: DEFAULT_DECK_ID,
        phase: "voting",
        timer: startTimer(now),
        updatedAt: now,
    },
    participants: [],
});

export const isEmpty = (room: Room): boolean => room.participants.length === 0;

export const isMember = (room: Room, clientId: string): boolean =>
    room.participants.some((p) => p.clientId === clientId);

const withMeta = (room: Room, patch: Partial<RoomMeta>, now: number): Room => ({
    ...room,
    meta: { ...room.meta, ...patch, updatedAt: now },
});

const mapParticipants = (
    room: Room,
    fn: (p: Participant) => Participant,
): Room => ({ ...room, participants: room.participants.map(fn) });

export const join = (
    room: Room,
    input: { clientId: string; connectionId: string; name: string },
    now: number,
): Room => {
    const existing = room.participants.find(
        (p) => p.clientId === input.clientId,
    );
    if (existing) {
        return mapParticipants(room, (p) =>
            p.clientId === input.clientId
                ? { ...p, connectionId: input.connectionId, name: input.name }
                : p,
        );
    }
    return {
        ...room,
        participants: [
            ...room.participants,
            { ...input, vote: null, joinedAt: now },
        ],
    };
};

export const leave = (room: Room, clientId: string): Room => ({
    ...room,
    participants: room.participants.filter((p) => p.clientId !== clientId),
});

const everyoneVoted = (room: Room): boolean =>
    room.participants.length > 0 &&
    room.participants.every((p) => p.vote !== null);

export const vote = (
    room: Room,
    clientId: string,
    card: string,
    now: number,
): Result<Room, "not_in_room" | "invalid_card"> => {
    if (!isMember(room, clientId)) return { ok: false, error: "not_in_room" };
    if (!isCardInDeck(DECKS[room.meta.deckId], card)) {
        return { ok: false, error: "invalid_card" };
    }
    const voted = mapParticipants(room, (p) =>
        p.clientId === clientId ? { ...p, vote: card } : p,
    );
    const phase: Phase = everyoneVoted(voted) ? "revealed" : voted.meta.phase;
    return { ok: true, value: withMeta(voted, { phase }, now) };
};

export const reveal = (room: Room, now: number): Room =>
    withMeta(
        mapParticipants(room, (p) =>
            p.vote === null ? { ...p, vote: SKIP_CARD } : p,
        ),
        { phase: "revealed" },
        now,
    );

const clearVotes = (room: Room): Room =>
    mapParticipants(room, (p) => ({ ...p, vote: null }));

export const nextRound = (room: Room, now: number): Room =>
    withMeta(
        clearVotes(room),
        { phase: "voting", timer: startTimer(now) },
        now,
    );

export const changeDeck = (room: Room, deckId: DeckId, now: number): Room =>
    withMeta(clearVotes(room), { phase: "voting", deckId }, now);

export const timerAction = (
    room: Room,
    action: "resetTimer" | "pauseTimer" | "resumeTimer",
    now: number,
): Room => {
    const timer =
        action === "resetTimer"
            ? startTimer(now)
            : action === "pauseTimer"
              ? pauseTimer(room.meta.timer, now)
              : resumeTimer(room.meta.timer, now);
    return withMeta(room, { timer }, now);
};
