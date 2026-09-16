import type { Room } from "../domain/room";
import type { RoomSnapshot, SnapshotParticipant } from "../protocol/messages";

/**
 * Builds the room view for one recipient. While voting, only `forClientId`
 * sees their own card; once revealed, everyone's card is included.
 */
export const toSnapshot = (room: Room, forClientId?: string): RoomSnapshot => {
    const revealed = room.meta.phase === "revealed";
    const participants: SnapshotParticipant[] = room.participants.map((p) =>
        revealed || p.clientId === forClientId
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
