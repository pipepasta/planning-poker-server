export type DeckId = "fibonacci" | "tshirt";

export interface Deck {
    readonly id: DeckId;
    readonly label: string;
    readonly kind: "numeric" | "ordinal";
    readonly cards: readonly string[];
}

export const SKIP_CARD = "skip";
export const DEFAULT_DECK_ID: DeckId = "fibonacci";

export const DECKS: Record<DeckId, Deck> = {
    fibonacci: {
        id: "fibonacci",
        label: "Fibonacci",
        kind: "numeric",
        cards: ["0.5", "1", "2", "3", "5", "8", "13", "20", "40", "100"],
    },
    tshirt: {
        id: "tshirt",
        label: "T-shirt",
        kind: "ordinal",
        cards: ["S", "M", "L", "XL"],
    },
};

export const isDeckId = (value: unknown): value is DeckId =>
    typeof value === "string" && value in DECKS;

export const isCardInDeck = (deck: Deck, card: string): boolean =>
    card === SKIP_CARD || deck.cards.includes(card);
