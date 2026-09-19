import type {
    APIGatewayProxyResultV2,
    APIGatewayProxyWebsocketEventV2,
    APIGatewayProxyWebsocketHandlerV2,
} from "aws-lambda";
import { dispatch } from "../../app/dispatch";
import type { AppContext } from "../../app/ports";
import { actorFromEvent, createLambdaContext } from "../context";

export const makeHandler =
    (
        ctx: AppContext,
    ): ((
        event: APIGatewayProxyWebsocketEventV2,
    ) => Promise<APIGatewayProxyResultV2>) =>
    async (event) => {
        const actor = actorFromEvent(event);
        if (!actor) return { statusCode: 401, body: "unauthorized" };
        await dispatch(ctx, actor, event.body);
        return { statusCode: 200, body: "ok" };
    };

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event) =>
    makeHandler(createLambdaContext())(event);
