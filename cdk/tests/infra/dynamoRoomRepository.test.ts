import {
    BatchWriteCommand,
    DeleteCommand,
    PutCommand,
    QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { describe, expect, it } from "vitest";
import { StaleRoomError } from "../../src/app/ports";
import type { Participant, RoomMeta } from "../../src/domain/room";
import { DynamoRoomRepository } from "../../src/infra/dynamoRoomRepository";

describe("DynamoRoomRepository.getRoom", () => {
    it("maps items to a Room, sorted by joinedAt", async () => {
        const sent: unknown[] = [];
        const client = {
            send: async (cmd: unknown) => {
                sent.push(cmd);
                return {
                    Items: [
                        {
                            roomId: "r1",
                            clientId: "b",
                            connectionId: "cb",
                            name: "B",
                            vote: null,
                            joinedAt: 20,
                        },
                        {
                            roomId: "r1",
                            clientId: "#ROOM",
                            deckId: "tshirt",
                            phase: "voting",
                            timerStatus: "paused",
                            timerStartedAt: null,
                            timerAccumulatedMs: 500,
                            updatedAt: 9,
                        },
                        {
                            roomId: "r1",
                            clientId: "a",
                            connectionId: "ca",
                            name: "A",
                            vote: "5",
                            joinedAt: 10,
                        },
                    ],
                };
            },
        };
        const repo = new DynamoRoomRepository(client);
        const room = await repo.getRoom("r1");
        expect(sent[0]).toBeInstanceOf(QueryCommand);
        expect(room).toEqual({
            meta: {
                id: "r1",
                deckId: "tshirt",
                phase: "voting",
                timer: {
                    status: "paused",
                    startedAt: null,
                    accumulatedMs: 500,
                },
                updatedAt: 9,
            },
            participants: [
                {
                    clientId: "a",
                    connectionId: "ca",
                    name: "A",
                    vote: "5",
                    joinedAt: 10,
                },
                {
                    clientId: "b",
                    connectionId: "cb",
                    name: "B",
                    vote: null,
                    joinedAt: 20,
                },
            ],
        });
    });

    it("returns null without a meta item", async () => {
        const repo = new DynamoRoomRepository({
            send: async () => ({ Items: [] }),
        });
        expect(await repo.getRoom("r1")).toBeNull();
    });
});

interface CommandInput {
    Key?: { roomId: string; clientId: string };
    Item?: Record<string, unknown>;
    IndexName?: string;
    KeyConditionExpression?: string;
    ConditionExpression?: string;
    ExpressionAttributeValues?: Record<string, unknown>;
    RequestItems?: Record<
        string,
        Array<{ DeleteRequest?: { Key: { roomId: string; clientId: string } } }>
    >;
}

const conditionalCheckFailed = (): Error =>
    Object.assign(new Error("condition failed"), {
        name: "ConditionalCheckFailedException",
    });

/** Minimal single-table DynamoDB stand-in: enough to round-trip the repository. */
class FakeDynamo {
    readonly items = new Map<string, Record<string, unknown>>();

    private static key(roomId: unknown, clientId: unknown): string {
        // roomIds cannot contain "/" (see isValidRoomId), so it separates safely.
        return `${roomId}/${clientId}`;
    }

    /** Evaluates the subset of condition expressions the repository emits. */
    private check(
        stored: Record<string, unknown> | undefined,
        input: CommandInput,
    ): void {
        const expression = input.ConditionExpression;
        if (!expression) return;
        if (expression.startsWith("attribute_not_exists")) {
            if (stored) throw conditionalCheckFailed();
            return;
        }
        const [attribute, placeholder] = expression.split(" = ");
        const expected = input.ExpressionAttributeValues?.[placeholder];
        if (!stored || stored[attribute] !== expected)
            throw conditionalCheckFailed();
    }

    async send(command: unknown): Promise<unknown> {
        const input = (command as { input: CommandInput }).input;
        if (command instanceof PutCommand) {
            const item = input.Item as Record<string, unknown>;
            const key = FakeDynamo.key(item.roomId, item.clientId);
            this.check(this.items.get(key), input);
            this.items.set(key, { ...item });
            return {};
        }
        if (command instanceof DeleteCommand) {
            const { roomId, clientId } = input.Key as {
                roomId: string;
                clientId: string;
            };
            const key = FakeDynamo.key(roomId, clientId);
            this.check(this.items.get(key), input);
            this.items.delete(key);
            return {};
        }
        if (command instanceof QueryCommand) {
            const values = input.ExpressionAttributeValues ?? {};
            const all = [...this.items.values()];
            return {
                Items: input.IndexName
                    ? all.filter((i) => i.clientId === values[":c"])
                    : all.filter((i) => i.roomId === values[":r"]),
            };
        }
        if (command instanceof BatchWriteCommand) {
            for (const requests of Object.values(input.RequestItems ?? {})) {
                for (const request of requests) {
                    const key = request.DeleteRequest?.Key;
                    if (key)
                        this.items.delete(
                            FakeDynamo.key(key.roomId, key.clientId),
                        );
                }
            }
            return {};
        }
        throw new Error("unsupported command");
    }
}

const meta = (updatedAt: number): RoomMeta => ({
    id: "r1",
    deckId: "tshirt",
    phase: "revealed",
    timer: { status: "paused", startedAt: null, accumulatedMs: 750 },
    updatedAt,
});

const member = (connectionId: string): Participant => ({
    clientId: "a",
    connectionId,
    name: "A",
    vote: "5",
    joinedAt: 10,
});

describe("DynamoRoomRepository round trip", () => {
    it("stores and reads back meta, participants and memberships", async () => {
        const repo = new DynamoRoomRepository(new FakeDynamo());
        await repo.saveMeta(meta(100), null);
        await repo.saveParticipant("r1", member("ca"));

        expect(await repo.getRoom("r1")).toEqual({
            meta: meta(100),
            participants: [member("ca")],
        });
        expect(await repo.findMemberships("a")).toEqual([
            { roomId: "r1", connectionId: "ca" },
        ]);
    });

    it("locks meta writes on updatedAt", async () => {
        const repo = new DynamoRoomRepository(new FakeDynamo());
        await repo.saveMeta(meta(100), null);
        await expect(repo.saveMeta(meta(200), null)).rejects.toBeInstanceOf(
            StaleRoomError,
        );
        await expect(repo.saveMeta(meta(200), 99)).rejects.toBeInstanceOf(
            StaleRoomError,
        );
        await repo.saveMeta(meta(200), 100);
        expect((await repo.getRoom("r1"))?.meta.updatedAt).toBe(200);
    });

    it("deletes a participant only when the connectionId matches", async () => {
        const repo = new DynamoRoomRepository(new FakeDynamo());
        await repo.saveMeta(meta(100), null);
        await repo.saveParticipant("r1", member("ca-new"));

        await repo.deleteParticipant("r1", "a", "ca-old");
        expect((await repo.getRoom("r1"))?.participants).toHaveLength(1);

        await repo.deleteParticipant("r1", "a", "ca-new");
        expect((await repo.getRoom("r1"))?.participants).toHaveLength(0);

        await repo.saveParticipant("r1", member("ca-new"));
        await repo.deleteParticipant("r1", "a");
        expect((await repo.getRoom("r1"))?.participants).toHaveLength(0);
    });

    it("deletes the whole room only from the expected updatedAt", async () => {
        const client = new FakeDynamo();
        const repo = new DynamoRoomRepository(client);
        await repo.saveMeta(meta(100), null);
        await repo.saveParticipant("r1", member("ca"));

        await expect(repo.deleteRoom("r1", 99)).rejects.toBeInstanceOf(
            StaleRoomError,
        );
        expect(client.items.size).toBe(2);

        await repo.deleteRoom("r1", 100);
        expect(client.items.size).toBe(0);
        expect(await repo.getRoom("r1")).toBeNull();
    });
});
