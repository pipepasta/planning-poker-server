import { type DeckId, isDeckId } from "../domain/deck";
import type { Phase, Result } from "../domain/room";
import type { TimerState } from "../domain/timer";

export type TimerActionName = "resetTimer" | "pauseTimer" | "resumeTimer";

export type ClientMessage =
    | { action: "joinRoom"; roomId: string; name: string }
    | { action: "submitCard"; roomId: string; card: string }
    | { action: "revealAllCards"; roomId: string }
    | { action: "resetRoom"; roomId: string }
    | { action: TimerActionName; roomId: string }
    | { action: "reaction"; roomId: string; emoji: string }
    | { action: "changeDeck"; roomId: string; deckId: DeckId };

export type ErrorCode =
    | "invalid_message"
    | "not_in_room"
    | "invalid_card"
    | "unknown_deck"
    | "invalid_name"
    | "invalid_room_id"
    | "internal";

export interface SnapshotParticipant {
    clientId: string;
    name: string;
    hasVoted: boolean;
    vote?: string | null;
}

export interface RoomSnapshot {
    id: string;
    deckId: DeckId;
    phase: Phase;
    timer: TimerState;
    participants: SnapshotParticipant[];
}

export type ServerMessage =
    | { type: "room"; serverTime: number; room: RoomSnapshot }
    | {
          type: "reaction";
          emoji: string;
          from: { clientId: string; name: string };
      }
    | { type: "error"; code: ErrorCode; message: string };

export const ROOM_ID_MAX = 12;
export const NAME_MAX = 15;

export const isValidRoomId = (value: string): boolean =>
    value.length >= 1 &&
    value.length <= ROOM_ID_MAX &&
    !/\s/.test(value) &&
    !value.includes("/");

export const normalizeName = (value: string): string | null => {
    const trimmed = value.trim();
    return trimmed.length >= 1 && trimmed.length <= NAME_MAX ? trimmed : null;
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null;

const fail = (error: ErrorCode): Result<never, ErrorCode> => ({
    ok: false,
    error,
});
const ok = <T>(value: T): Result<T, ErrorCode> => ({ ok: true, value });

const TIMER_ACTIONS: readonly string[] = [
    "resetTimer",
    "pauseTimer",
    "resumeTimer",
];

export const parseClientMessage = (
    raw: unknown,
): Result<ClientMessage, ErrorCode> => {
    if (!isRecord(raw) || typeof raw.action !== "string")
        return fail("invalid_message");
    if (typeof raw.roomId !== "string" || !isValidRoomId(raw.roomId))
        return fail("invalid_room_id");
    const roomId = raw.roomId;

    switch (raw.action) {
        case "joinRoom": {
            if (typeof raw.name !== "string") return fail("invalid_name");
            const name = normalizeName(raw.name);
            return name
                ? ok({ action: "joinRoom", roomId, name })
                : fail("invalid_name");
        }
        case "submitCard":
            return typeof raw.card === "string" && raw.card.length > 0
                ? ok({ action: "submitCard", roomId, card: raw.card })
                : fail("invalid_message");
        case "revealAllCards":
            return ok({ action: "revealAllCards", roomId });
        case "resetRoom":
            return ok({ action: "resetRoom", roomId });
        case "reaction":
            return typeof raw.emoji === "string" &&
                raw.emoji.length > 0 &&
                raw.emoji.length <= 16
                ? ok({ action: "reaction", roomId, emoji: raw.emoji })
                : fail("invalid_message");
        case "changeDeck":
            return isDeckId(raw.deckId)
                ? ok({ action: "changeDeck", roomId, deckId: raw.deckId })
                : fail("unknown_deck");
        default:
            return TIMER_ACTIONS.includes(raw.action)
                ? ok({ action: raw.action as TimerActionName, roomId })
                : fail("invalid_message");
    }
};
