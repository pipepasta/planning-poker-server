import type { Participant, Room, RoomMeta } from "../domain/room";
import type { ServerMessage } from "../protocol/messages";

export interface Membership {
    roomId: string;
    connectionId: string;
}

/** Thrown when a conditional write lost a race against a concurrent writer. */
export class StaleRoomError extends Error {
    constructor(readonly roomId: string) {
        super(`room ${roomId} changed under us`);
        this.name = "StaleRoomError";
    }
}

export interface RoomRepository {
    getRoom(roomId: string): Promise<Room | null>;
    /**
     * Writes the meta item under an optimistic lock.
     * `expectedUpdatedAt` is the `updatedAt` the caller read, or `null` when the
     * room must not exist yet. Throws {@link StaleRoomError} when it no longer holds.
     */
    saveMeta(meta: RoomMeta, expectedUpdatedAt: number | null): Promise<void>;
    saveParticipant(roomId: string, participant: Participant): Promise<void>;
    /** Deletes the row only when `expectedConnectionId` matches the stored one. */
    deleteParticipant(
        roomId: string,
        clientId: string,
        expectedConnectionId?: string,
    ): Promise<void>;
    /** Throws {@link StaleRoomError} when the meta item no longer has `expectedUpdatedAt`. */
    deleteRoom(roomId: string, expectedUpdatedAt: number): Promise<void>;
    findMemberships(clientId: string): Promise<Membership[]>;
}

export interface Broadcaster {
    send(connectionId: string, message: ServerMessage): Promise<"ok" | "gone">;
}

export interface AppContext {
    repo: RoomRepository;
    broadcaster: Broadcaster;
    now: () => number;
}
