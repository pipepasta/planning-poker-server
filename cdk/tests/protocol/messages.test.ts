import { describe, expect, it } from "vitest";
import { parseClientMessage } from "../../src/protocol/messages";

describe("parseClientMessage", () => {
    it("parses every action", () => {
        expect(
            parseClientMessage({
                action: "joinRoom",
                roomId: "abc",
                name: "  Ann ",
            }),
        ).toEqual({
            ok: true,
            value: { action: "joinRoom", roomId: "abc", name: "Ann" },
        });
        expect(
            parseClientMessage({
                action: "submitCard",
                roomId: "abc",
                card: "5",
            }),
        ).toEqual({
            ok: true,
            value: { action: "submitCard", roomId: "abc", card: "5" },
        });
        for (const action of [
            "revealAllCards",
            "resetRoom",
            "resetTimer",
            "pauseTimer",
            "resumeTimer",
        ]) {
            expect(parseClientMessage({ action, roomId: "abc" })).toEqual({
                ok: true,
                value: { action, roomId: "abc" },
            });
        }
        expect(
            parseClientMessage({
                action: "reaction",
                roomId: "abc",
                emoji: "👍",
            }),
        ).toEqual({
            ok: true,
            value: { action: "reaction", roomId: "abc", emoji: "👍" },
        });
        expect(
            parseClientMessage({
                action: "changeDeck",
                roomId: "abc",
                deckId: "tshirt",
            }),
        ).toEqual({
            ok: true,
            value: { action: "changeDeck", roomId: "abc", deckId: "tshirt" },
        });
        expect(
            parseClientMessage({
                action: "changeMetric",
                roomId: "abc",
                metric: "average",
            }),
        ).toEqual({
            ok: true,
            value: { action: "changeMetric", roomId: "abc", metric: "average" },
        });
    });

    it("rejects malformed input with specific codes", () => {
        expect(parseClientMessage(null)).toEqual({
            ok: false,
            error: "invalid_message",
        });
        expect(parseClientMessage({ action: "fly", roomId: "abc" })).toEqual({
            ok: false,
            error: "invalid_message",
        });
        expect(
            parseClientMessage({ action: "resetRoom", roomId: "a b" }),
        ).toEqual({ ok: false, error: "invalid_room_id" });
        expect(
            parseClientMessage({ action: "resetRoom", roomId: "a/b" }),
        ).toEqual({ ok: false, error: "invalid_room_id" });
        expect(
            parseClientMessage({
                action: "resetRoom",
                roomId: "1234567890123",
            }),
        ).toEqual({ ok: false, error: "invalid_room_id" });
        expect(
            parseClientMessage({
                action: "joinRoom",
                roomId: "abc",
                name: "   ",
            }),
        ).toEqual({ ok: false, error: "invalid_name" });
        expect(
            parseClientMessage({
                action: "joinRoom",
                roomId: "abc",
                name: "1234567890123456",
            }),
        ).toEqual({ ok: false, error: "invalid_name" });
        expect(
            parseClientMessage({
                action: "submitCard",
                roomId: "abc",
                card: 5,
            }),
        ).toEqual({ ok: false, error: "invalid_message" });
        expect(
            parseClientMessage({
                action: "changeDeck",
                roomId: "abc",
                deckId: "poker",
            }),
        ).toEqual({ ok: false, error: "unknown_deck" });
        expect(
            parseClientMessage({
                action: "changeMetric",
                roomId: "abc",
                metric: "median",
            }),
        ).toEqual({ ok: false, error: "unknown_metric" });
        expect(
            parseClientMessage({ action: "changeMetric", roomId: "abc" }),
        ).toEqual({ ok: false, error: "unknown_metric" });
        expect(
            parseClientMessage({
                action: "reaction",
                roomId: "abc",
                emoji: "",
            }),
        ).toEqual({ ok: false, error: "invalid_message" });
    });
});
