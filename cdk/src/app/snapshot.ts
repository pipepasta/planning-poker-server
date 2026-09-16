import type { Room } from "../domain/room";
import type { RoomSnapshot, SnapshotParticipant } from "../protocol/messages";

export const toSnapshot = (room: Room): RoomSnapshot => {
    const revealed = room.meta.phase === "revealed";
    const participants: SnapshotParticipant[] = room.participants.map((p) =>
        revealed
            ? {
                  clientId: p.clientId,
                  name: p.name,
                  hasVoted: p.vote !== null,
                  vote: p.vote,
              }
            : { clientId: p.clientId, name: p.name, hasVoted: p.vote !== null },
    );
    return {
        id: room.meta.id,
        deckId: room.meta.deckId,
        phase: room.meta.phase,
        timer: room.meta.timer,
        participants,
    };
};
