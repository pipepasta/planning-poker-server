import type { AppContext } from "../app/ports";
import type { Actor } from "../app/usecases";
import { createBroadcaster } from "../infra/apiGatewayBroadcaster";
import { createDynamoRoomRepository } from "../infra/dynamoRoomRepository";

let cached: AppContext | null = null;

export const createLambdaContext = (): AppContext => {
    if (!cached) {
        cached = {
            repo: createDynamoRoomRepository(),
            broadcaster: createBroadcaster(),
            now: () => Date.now(),
        };
    }
    return cached;
};

interface AuthorizedRequestContext {
    connectionId?: string;
    authorizer?: { userId?: string };
}

export const actorFromEvent = (event: {
    requestContext: AuthorizedRequestContext;
}): Actor | null => {
    const clientId = event.requestContext.authorizer?.userId;
    const connectionId = event.requestContext.connectionId;
    if (!clientId || !connectionId) return null;
    return { clientId, connectionId };
};
