import {
    ApiGatewayManagementApiClient,
    GoneException,
    PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";
import type { Broadcaster } from "../app/ports";
import type { ServerMessage } from "../protocol/messages";

export class ApiGatewayBroadcaster implements Broadcaster {
    private readonly client: ApiGatewayManagementApiClient;

    constructor(endpoint: string) {
        this.client = new ApiGatewayManagementApiClient({ endpoint });
    }

    async send(
        connectionId: string,
        message: ServerMessage,
    ): Promise<"ok" | "gone"> {
        try {
            await this.client.send(
                new PostToConnectionCommand({
                    ConnectionId: connectionId,
                    Data: Buffer.from(JSON.stringify(message)),
                }),
            );
            return "ok";
        } catch (error) {
            if (error instanceof GoneException) return "gone";
            const status = (
                error as { $metadata?: { httpStatusCode?: number } }
            ).$metadata?.httpStatusCode;
            if (status === 410) return "gone";
            console.error({
                message: "postToConnection failed",
                connectionId,
                error,
            });
            return "ok";
        }
    }
}

export const createBroadcaster = (): ApiGatewayBroadcaster => {
    const endpoint = process.env.MANAGEMENT_ENDPOINT;
    if (!endpoint)
        throw new Error("MANAGEMENT_ENDPOINT environment variable is not set");
    return new ApiGatewayBroadcaster(endpoint);
};
