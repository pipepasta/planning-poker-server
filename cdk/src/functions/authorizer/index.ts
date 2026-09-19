import type { APIGatewayAuthorizerResult } from "aws-lambda";
import { verifyWithJwks } from "./verify";

export interface AuthorizerEvent {
    methodArn: string;
    queryStringParameters?: Record<string, string | undefined>;
    requestContext: { connectionId?: string };
}

type Verify = (token: string) => Promise<{ sub?: string }>;

const policy = (
    principalId: string,
    effect: "Allow" | "Deny",
    resource: string,
    context: Record<string, string> = {},
): APIGatewayAuthorizerResult => ({
    principalId,
    policyDocument: {
        Version: "2012-10-17",
        Statement: [
            {
                Action: "execute-api:Invoke",
                Effect: effect,
                Resource: resource,
            },
        ],
    },
    context,
});

export const makeAuthorizer =
    (verify: Verify) =>
    async (event: AuthorizerEvent): Promise<APIGatewayAuthorizerResult> => {
        const connectionId = event.requestContext.connectionId ?? "unknown";
        const token = event.queryStringParameters?.token;
        if (!token) return policy(connectionId, "Deny", event.methodArn);
        try {
            const { sub } = await verify(token);
            if (!sub) return policy(connectionId, "Deny", event.methodArn);
            return policy(sub, "Allow", event.methodArn, { userId: sub });
        } catch (error) {
            console.warn({
                message: "token verification failed",
                error: error instanceof Error ? error.message : error,
            });
            return policy(connectionId, "Deny", event.methodArn);
        }
    };

export const handler = makeAuthorizer(verifyWithJwks);
