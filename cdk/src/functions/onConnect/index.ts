import type { APIGatewayProxyWebsocketHandlerV2 } from "aws-lambda";

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event) => {
    console.info({
        message: "connected",
        connectionId: event.requestContext.connectionId,
    });
    return { statusCode: 200, body: "connected" };
};
