import type { APIGatewayProxyWebsocketHandlerV2 } from "aws-lambda";
import { leaveUsecase } from "../../app/usecases";
import { actorFromEvent, createLambdaContext } from "../context";

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event) => {
    const actor = actorFromEvent(event);
    if (!actor) return { statusCode: 200, body: "no actor" };
    try {
        await leaveUsecase(createLambdaContext(), actor);
    } catch (error) {
        console.error({ message: "disconnect cleanup failed", error });
    }
    return { statusCode: 200, body: "disconnected" };
};
