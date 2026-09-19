import { createRemoteJWKSet, jwtVerify } from "jose";

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

export const verifyWithJwks = async (
    token: string,
): Promise<{ sub?: string }> => {
    if (!jwks) {
        const url = process.env.JWKS_URL;
        if (!url) throw new Error("JWKS_URL environment variable is not set");
        jwks = createRemoteJWKSet(new URL(url));
    }
    const { payload } = await jwtVerify(token, jwks, {
        audience: "authenticated",
    });
    return { sub: payload.sub };
};
