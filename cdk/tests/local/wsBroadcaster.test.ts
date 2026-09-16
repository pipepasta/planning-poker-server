import { describe, expect, it } from "vitest";
import { WsBroadcaster } from "../../src/local/wsBroadcaster";

describe("WsBroadcaster", () => {
    it("sends to open sockets and reports gone otherwise", async () => {
        const b = new WsBroadcaster();
        const sent: string[] = [];
        b.register("c1", { readyState: 1, send: (d) => sent.push(d) });
        b.register("c2", { readyState: 3, send: () => {} });
        expect(
            await b.send("c1", {
                type: "error",
                code: "internal",
                message: "x",
            }),
        ).toBe("ok");
        expect(JSON.parse(sent[0])).toEqual({
            type: "error",
            code: "internal",
            message: "x",
        });
        expect(
            await b.send("c2", {
                type: "error",
                code: "internal",
                message: "x",
            }),
        ).toBe("gone");
        expect(
            await b.send("nope", {
                type: "error",
                code: "internal",
                message: "x",
            }),
        ).toBe("gone");
    });
});
