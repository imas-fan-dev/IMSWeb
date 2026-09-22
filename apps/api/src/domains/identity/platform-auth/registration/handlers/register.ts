import type { PlatformSession } from '@imsweb/contracts/platform';
import type { Context } from "hono";
import type { AppEnvironment } from "@/app";
import {
    establishPlatformSession,
    platformSessionPayload,
} from "@/domains/identity/platform-auth/contracts/session";
import { clearPlatformEmailVerificationCooldown } from "@/domains/identity/platform-auth/registration/email-verification-cache";
import { hashPlatformEmailVerificationCode } from "@/domains/identity/platform-auth/registration/email-verification";
import { platformAccountRepository, services } from "@/middleware/hono-context";
import type { ValidatedRequestContext } from '@/middleware/request-validation';
import { randomHex } from "@/utils/crypto/random";

const BCRYPT_PARAMETERS_JSON = JSON.stringify({
    cost: 12,
    normalization: "trim",
});

export async function handlePlatformRegister(
    c: ValidatedRequestContext<AppEnvironment, 'json', {
        code: string;
        displayName: string;
        email: string;
        password: string;
    }>,
): Promise<Response> {
    const input = c.req.valid('json');
    const passwords = services(c).passwords;
    if (!passwords?.hash) {
        throw new Error(
            "Platform password authentication services unavailable",
        );
    }
    const passwordHash = await passwords.hash(input.password);
    const now = Date.now();
    const result = await platformAccountRepository(
        c,
    ).createVerifiedEmailAccount({
        id: crypto.randomUUID(),
        status: "active",
        tokenVersion: 0,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        profile: {
            displayName: input.displayName,
            avatarObjectKey: null,
            avatarExternalUrl: null,
            homeCity: null,
            bio: "",
            updatedAt: now,
        },
        credential: {
            normalizedEmail: input.email,
            algorithm: "bcrypt",
            parametersJson: BCRYPT_PARAMETERS_JSON,
            passwordHash,
            createdAt: now,
            updatedAt: now,
        },
        verification: {
            codeHash: hashPlatformEmailVerificationCode(
                input.email,
                input.code,
            ),
            consumedToken: randomHex(32),
            verifiedAt: now,
        },
    });
    if (result.status === "verification-invalid") {
        return c.json(
            {
                success: false,
                code: "PLATFORM_EMAIL_VERIFICATION_INVALID",
            },
            400,
        );
    }
    if (result.status === "email-conflict") {
        await clearPlatformEmailVerificationCooldown(
            services(c).cache,
            input.email,
        );
        return c.json({ success: false, code: "PLATFORM_EMAIL_EXISTS" }, 409);
    }
    await clearPlatformEmailVerificationCooldown(
        services(c).cache,
        input.email,
    );
    const tokens = await establishPlatformSession(c, result.identity);
    if (!tokens) {
        return c.json(
            {
                success: false,
                code: "PLATFORM_ACCOUNT_UNAVAILABLE",
            },
            403,
        );
    }
    return c.json(
        await platformSessionPayload(c, result.identity, tokens) satisfies PlatformSession,
        201,
    );
}
