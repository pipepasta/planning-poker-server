import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { describe, expect, it } from "vitest";
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
