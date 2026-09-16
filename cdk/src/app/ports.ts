import type { Participant, Room, RoomMeta } from "../domain/room";
import type { ServerMessage } from "../protocol/messages";

export interface Membership {
    roomId: string;
    connectionId: string;
}

export interface RoomRepository {
    getRoom(roomId: string): Promise<Room | null>;
    saveMeta(meta: RoomMeta): Promise<void>;
    saveParticipant(roomId: string, participant: Participant): Promise<void>;
    deleteParticipant(roomId: string, clientId: string): Promise<void>;
    deleteRoom(roomId: string): Promise<void>;
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
