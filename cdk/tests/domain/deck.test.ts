import { describe, expect, it } from "vitest";
import {
    DECKS,
    DEFAULT_DECK_ID,
    isCardInDeck,
    isDeckId,
    SKIP_CARD,
} from "../../src/domain/deck";

describe("deck", () => {
    it("defines fibonacci and tshirt decks", () => {
        expect(DECKS.fibonacci.cards).toEqual([
            "0.5",
            "1",
            "2",
            "3",
            "5",
            "8",
            "13",
            "20",
            "40",
            "100",
        ]);
        expect(DECKS.tshirt.cards).toEqual(["S", "M", "L", "XL"]);
        expect(DEFAULT_DECK_ID).toBe("fibonacci");
    });

    it("recognises deck ids", () => {
        expect(isDeckId("fibonacci")).toBe(true);
        expect(isDeckId("tshirt")).toBe(true);
        expect(isDeckId("poker")).toBe(false);
        expect(isDeckId(3)).toBe(false);
    });

    it("accepts deck cards and skip, rejects others", () => {
        expect(isCardInDeck(DECKS.fibonacci, "8")).toBe(true);
        expect(isCardInDeck(DECKS.tshirt, "XL")).toBe(true);
        expect(isCardInDeck(DECKS.tshirt, SKIP_CARD)).toBe(true);
        expect(isCardInDeck(DECKS.tshirt, "8")).toBe(false);
    });
});
