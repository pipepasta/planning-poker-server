import type { Membership, RoomRepository } from "../app/ports";
import type { Participant, Room, RoomMeta } from "../domain/room";

export class InMemoryRoomRepository implements RoomRepository {
    readonly rooms = new Map<string, Room>();

    async getRoom(roomId: string): Promise<Room | null> {
        const room = this.rooms.get(roomId);
        if (!room) return null;
        return {
            ...room,
            participants: [...room.participants].sort(
                (a, b) =>
                    a.joinedAt - b.joinedAt ||
                    a.clientId.localeCompare(b.clientId),
            ),
        };
    }

    async saveMeta(meta: RoomMeta): Promise<void> {
        const existing = this.rooms.get(meta.id);
        this.rooms.set(meta.id, {
            meta,
            participants: existing?.participants ?? [],
        });
    }

    async saveParticipant(
        roomId: string,
        participant: Participant,
    ): Promise<void> {
        const room = this.rooms.get(roomId);
        if (!room) throw new Error(`room ${roomId} does not exist`);
        const others = room.participants.filter(
            (p) => p.clientId !== participant.clientId,
        );
        this.rooms.set(roomId, {
            ...room,
            participants: [...others, participant],
        });
    }

    async deleteParticipant(
        roomId: string,
        clientId: string,
        expectedConnectionId?: string,
    ): Promise<void> {
        const room = this.rooms.get(roomId);
        if (!room) return;
        const target = room.participants.find((p) => p.clientId === clientId);
        if (!target) return;
        if (
            expectedConnectionId !== undefined &&
            target.connectionId !== expectedConnectionId
        )
            return;
        this.rooms.set(roomId, {
            ...room,
            participants: room.participants.filter(
                (p) => p.clientId !== clientId,
            ),
        });
    }

    async deleteRoom(roomId: string): Promise<void> {
        this.rooms.delete(roomId);
    }

    async findMemberships(clientId: string): Promise<Membership[]> {
        const result: Membership[] = [];
        for (const room of this.rooms.values()) {
            const p = room.participants.find((x) => x.clientId === clientId);
            if (p)
                result.push({
                    roomId: room.meta.id,
                    connectionId: p.connectionId,
                });
        }
        return result;
    }
}
