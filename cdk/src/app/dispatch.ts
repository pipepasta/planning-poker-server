import { parseClientMessage } from "../protocol/messages";
import { sendError } from "./broadcast";
import type { AppContext } from "./ports";
import {
    type Actor,
    changeDeckUsecase,
    changeMetricUsecase,
    joinRoomUsecase,
    nextRoundUsecase,
    reactionUsecase,
    revealUsecase,
    submitCardUsecase,
    timerUsecase,
} from "./usecases";

const parseJson = (body: string | undefined): unknown => {
    try {
        return JSON.parse(body ?? "");
    } catch {
        return undefined;
    }
};

export const dispatch = async (
    ctx: AppContext,
    actor: Actor,
    rawBody: string | undefined,
): Promise<void> => {
    if (rawBody === "ping") return; // heartbeat: never answer, never error
    const parsed = parseClientMessage(parseJson(rawBody));
    if (!parsed.ok) {
        await sendError(
            ctx,
            actor.connectionId,
            parsed.error,
            `Rejected message: ${parsed.error}`,
        );
        return;
    }
    const msg = parsed.value;
    try {
        switch (msg.action) {
            case "joinRoom":
                return await joinRoomUsecase(ctx, actor, msg);
            case "submitCard":
                return await submitCardUsecase(ctx, actor, msg);
            case "revealAllCards":
                return await revealUsecase(ctx, actor, msg);
            case "resetRoom":
                return await nextRoundUsecase(ctx, actor, msg);
            case "resetTimer":
            case "pauseTimer":
            case "resumeTimer":
                return await timerUsecase(ctx, actor, {
                    roomId: msg.roomId,
                    action: msg.action,
                });
            case "changeDeck":
                return await changeDeckUsecase(ctx, actor, msg);
            case "changeMetric":
                return await changeMetricUsecase(ctx, actor, msg);
            case "reaction":
                return await reactionUsecase(ctx, actor, msg);
        }
    } catch (error) {
        console.error({ message: "usecase failed", action: msg.action, error });
        await sendError(
            ctx,
            actor.connectionId,
            "internal",
            "Something went wrong.",
        );
    }
};
