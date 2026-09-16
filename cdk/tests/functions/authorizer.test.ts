import { describe, expect, it } from "vitest";
import { makeAuthorizer } from "../../src/functions/authorizer/index";

const event = (token?: string) =>
    ({
        methodArn: "arn:aws:execute-api:ap-northeast-1:1:abc/v1/$connect",
        queryStringParameters: token ? { token } : {},
        requestContext: { connectionId: "c1" },
    }) as never;

describe("authorizer", () => {
    it("allows a valid token and exposes the sub", async () => {
        const auth = makeAuthorizer(async () => ({ sub: "user-1" }));
        const res = await auth(event("good"));
        expect(res.policyDocument.Statement[0]).toMatchObject({
            Effect: "Allow",
            Resource: "arn:aws:execute-api:ap-northeast-1:1:abc/v1/$connect",
        });
        expect(res.context).toEqual({ userId: "user-1" });
    });

    it("denies missing or invalid tokens", async () => {
        const auth = makeAuthorizer(async () => {
            throw new Error("bad");
        });
        expect((await auth(event())).policyDocument.Statement[0]).toMatchObject(
            { Effect: "Deny" },
        );
        expect(
            (await auth(event("bad"))).policyDocument.Statement[0],
        ).toMatchObject({ Effect: "Deny" });
    });
});
