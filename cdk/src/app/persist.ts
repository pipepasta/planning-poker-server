import { isEmpty, type Participant, type Room } from "../domain/room";
import type { RoomRepository } from "./ports";

const sameParticipant = (a: Participant, b: Participant): boolean =>
    a.connectionId === b.connectionId &&
    a.name === b.name &&
    a.vote === b.vote &&
    a.joinedAt === b.joinedAt;

export const persistRoom = async (
    repo: RoomRepository,
    before: Room | null,
    after: Room,
): Promise<void> => {
    if (isEmpty(after)) {
        await repo.deleteRoom(after.meta.id);
        return;
    }
    const metaChanged =
        before === null ||
        JSON.stringify(before.meta) !== JSON.stringify(after.meta);
    if (metaChanged) await repo.saveMeta(after.meta);

    const beforeById = new Map(
        (before?.participants ?? []).map((p) => [p.clientId, p]),
    );
    for (const p of after.participants) {
        const prev = beforeById.get(p.clientId);
        if (!prev || !sameParticipant(prev, p)) {
            await repo.saveParticipant(after.meta.id, p);
        }
    }
    const afterIds = new Set(after.participants.map((p) => p.clientId));
    for (const [clientId, prev] of beforeById) {
        if (!afterIds.has(clientId))
            await repo.deleteParticipant(
                after.meta.id,
                clientId,
                prev.connectionId,
            );
    }
};
