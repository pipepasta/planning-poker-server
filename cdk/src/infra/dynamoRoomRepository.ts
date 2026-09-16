import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
    BatchWriteCommand,
    DeleteCommand,
    DynamoDBDocumentClient,
    PutCommand,
    QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import type { Membership, RoomRepository } from "../app/ports";
import { isDeckId } from "../domain/deck";
import type { Participant, Room, RoomMeta } from "../domain/room";

export const ROOM_META_SK = "#ROOM";

export interface SendClient {
    send(command: unknown): Promise<unknown>;
}

type Item = Record<string, unknown>;

const num = (v: unknown, fallback = 0): number =>
    typeof v === "number" ? v : fallback;
const str = (v: unknown, fallback = ""): string =>
    typeof v === "string" ? v : fallback;

const isConditionalCheckFailed = (error: unknown): boolean =>
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "ConditionalCheckFailedException";

const toMeta = (roomId: string, item: Item): RoomMeta => ({
    id: roomId,
    deckId: isDeckId(item.deckId) ? item.deckId : "fibonacci",
    phase: item.phase === "revealed" ? "revealed" : "voting",
    timer: {
        status: item.timerStatus === "paused" ? "paused" : "running",
        startedAt:
            typeof item.timerStartedAt === "number"
                ? item.timerStartedAt
                : null,
        accumulatedMs: num(item.timerAccumulatedMs),
    },
    updatedAt: num(item.updatedAt),
});

const toParticipant = (item: Item): Participant => ({
    clientId: str(item.clientId),
    connectionId: str(item.connectionId),
    name: str(item.name),
    vote: typeof item.vote === "string" ? item.vote : null,
    joinedAt: num(item.joinedAt),
});

export class DynamoRoomRepository implements RoomRepository {
    constructor(
        private readonly client: SendClient,
        private readonly tableName = "PlanningPoker",
    ) {}

    private async queryRoomItems(roomId: string): Promise<Item[]> {
        const out = (await this.client.send(
            new QueryCommand({
                TableName: this.tableName,
                KeyConditionExpression: "roomId = :r",
                ExpressionAttributeValues: { ":r": roomId },
            }),
        )) as { Items?: Item[] };
        return out.Items ?? [];
    }

    async getRoom(roomId: string): Promise<Room | null> {
        const items = await this.queryRoomItems(roomId);
        const metaItem = items.find((i) => i.clientId === ROOM_META_SK);
        if (!metaItem) return null;
        const participants = items
            .filter((i) => i.clientId !== ROOM_META_SK)
            .map(toParticipant)
            .sort(
                (a, b) =>
                    a.joinedAt - b.joinedAt ||
                    a.clientId.localeCompare(b.clientId),
            );
        return { meta: toMeta(roomId, metaItem), participants };
    }

    async saveMeta(meta: RoomMeta): Promise<void> {
        await this.client.send(
            new PutCommand({
                TableName: this.tableName,
                Item: {
                    roomId: meta.id,
                    clientId: ROOM_META_SK,
                    deckId: meta.deckId,
                    phase: meta.phase,
                    timerStatus: meta.timer.status,
                    timerStartedAt: meta.timer.startedAt,
                    timerAccumulatedMs: meta.timer.accumulatedMs,
                    updatedAt: meta.updatedAt,
                },
            }),
        );
    }

    async saveParticipant(roomId: string, p: Participant): Promise<void> {
        await this.client.send(
            new PutCommand({
                TableName: this.tableName,
                Item: {
                    roomId,
                    clientId: p.clientId,
                    connectionId: p.connectionId,
                    name: p.name,
                    vote: p.vote,
                    joinedAt: p.joinedAt,
                },
            }),
        );
    }

    async deleteParticipant(
        roomId: string,
        clientId: string,
        expectedConnectionId?: string,
    ): Promise<void> {
        const condition =
            expectedConnectionId === undefined
                ? {}
                : {
                      ConditionExpression: "connectionId = :c",
                      ExpressionAttributeValues: { ":c": expectedConnectionId },
                  };
        try {
            await this.client.send(
                new DeleteCommand({
                    TableName: this.tableName,
                    Key: { roomId, clientId },
                    ...condition,
                }),
            );
        } catch (error) {
            // Someone reconnected under a new connectionId: leave their row alone.
            if (!isConditionalCheckFailed(error)) throw error;
        }
    }

    async deleteRoom(roomId: string): Promise<void> {
        const items = await this.queryRoomItems(roomId);
        for (let i = 0; i < items.length; i += 25) {
            const chunk = items.slice(i, i + 25);
            await this.client.send(
                new BatchWriteCommand({
                    RequestItems: {
                        [this.tableName]: chunk.map((item) => ({
                            DeleteRequest: {
                                Key: { roomId, clientId: item.clientId },
                            },
                        })),
                    },
                }),
            );
        }
    }

    async findMemberships(clientId: string): Promise<Membership[]> {
        const out = (await this.client.send(
            new QueryCommand({
                TableName: this.tableName,
                IndexName: "ClientIdIndex",
                KeyConditionExpression: "clientId = :c",
                ExpressionAttributeValues: { ":c": clientId },
            }),
        )) as { Items?: Item[] };
        return (out.Items ?? [])
            .filter((i) => i.clientId !== ROOM_META_SK)
            .map((i) => ({
                roomId: str(i.roomId),
                connectionId: str(i.connectionId),
            }));
    }
}

export const createDynamoRoomRepository = (): DynamoRoomRepository =>
    new DynamoRoomRepository(
        DynamoDBDocumentClient.from(new DynamoDBClient({})),
    );
