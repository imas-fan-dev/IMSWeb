import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
    platformProfileMutationResponseSchema,
    platformProfileResponseSchema,
    platformProfileSchema
} from "@imsweb/contracts/platform";
import {
    wikiAdminCatalogSchema,
    wikiAdminStoriesSchema,
    wikiPublicCatalogSchema,
    wikiPublicStoriesSchema
} from "@imsweb/contracts/wiki";
import { platformProfileView } from "@/domains/identity/platform-profile/profile-view";
import type {
    PlatformAccountRepository,
    PlatformAccountStatus,
    PlatformProfileRecord,
    PlatformProfileSaveResult,
    PlatformRefreshSessionRecord,
    UpdatePlatformProfileTextInput
} from "@/ports/repositories";
import type { PlatformJwtClaims, PlatformTokenService } from "@/ports/security";
import { createWikiFixture, type WikiFixture } from "./fixture";

// The same zod schemas the Web client uses to parse responses are applied to
// real route output here, so a payload the API emits but the client would
// reject can never pass the suite. The schemas live in @imsweb/contracts —
// the single wire-format source of truth for both workspaces.

function seedStoryContent(fixture: ReturnType<typeof createWikiFixture>) {
    fixture.story.seedStory({
        idol_id: 6,
        category: "enzaP卡",
        card_name: "【动态剧情】",
        up_name: "来源一",
        video_title: "第一话",
        subtitle: "全话",
        image_file: "cards/story-image.webp"
    });
    fixture.storage.seed(
        "wiki/agencies/sc/idols/sc_idol/story-images/cards/story-image.webp"
    );
}

const PLATFORM_ACCOUNT_ID = "platform-conformance-account";
const PLATFORM_SESSION_ID = "platform-conformance-session";
const PLATFORM_ACCESS_TOKEN = "platform-conformance-access-token";
const PLATFORM_CSRF_SECRET = "platform-conformance-csrf-secret";

interface PlatformProfileFixture {
    app: WikiFixture["app"];
    profile: PlatformProfileRecord;
    headers(extra?: Record<string, string>): Record<string, string>;
}

function platformProfileRecord(
    overrides: Partial<PlatformProfileRecord> = {}
): PlatformProfileRecord {
    return {
        account_id: PLATFORM_ACCOUNT_ID,
        display_name: "守护制作人",
        avatar_object_key: null,
        avatar_external_url: null,
        home_city: "上海",
        bio: "资料契约一致性用例",
        updated_at: 1_000,
        ...overrides
    };
}

// The Wiki fixture already assembles the whole Hono app through createHonoApp,
// so the Platform profile routes are registered but unreachable until the
// runtime gains the two services `platformAuth` requires. Bearer credentials
// are used deliberately: `platformCsrf` short-circuits on the authorization
// source, keeping this helper focused on wire shape rather than session
// mechanics that platform-session-security.contract.test.ts already covers.
function attachPlatformAccount(
    fixture: WikiFixture,
    options: {
        status?: PlatformAccountStatus;
        fudabaWrite?: boolean;
        profile?: Partial<PlatformProfileRecord>;
    } = {}
): PlatformProfileFixture {
    const status = options.status ?? "active";
    const state = { profile: platformProfileRecord(options.profile) };
    const session: PlatformRefreshSessionRecord = {
        id: PLATFORM_SESSION_ID,
        account_id: PLATFORM_ACCOUNT_ID,
        token_hash: "refresh-hash",
        previous_token_hash: null,
        csrf_hash: "csrf-hash",
        expires_at: Date.now() + 3_600_000,
        created_at: 500,
        updated_at: 500,
        revoked_at: null,
        user_agent: null,
        ip_address: null,
        last_seen_at: null
    };

    const platformTokens: PlatformTokenService = {
        async sign() {
            return PLATFORM_ACCESS_TOKEN;
        },
        async verify(token: string): Promise<PlatformJwtClaims> {
            if (token !== PLATFORM_ACCESS_TOKEN) {
                throw new Error("unknown Platform access token");
            }
            const now = Math.floor(Date.now() / 1000);
            return {
                iss: "imsweb",
                aud: "ims-platform",
                kind: "platform",
                id: PLATFORM_ACCOUNT_ID,
                tokenVersion: 0,
                sessionId: PLATFORM_SESSION_ID,
                csrfSecret: PLATFORM_CSRF_SECRET,
                jti: "platform-access",
                iat: now,
                exp: now + 900
            };
        }
    };

    const platformAccounts = {
        async findRefreshSessionById(id: string) {
            return id === session.id ? { ...session } : null;
        },
        async findAccountWithProfileById(id: string) {
            if (id !== PLATFORM_ACCOUNT_ID) return null;
            return {
                account: {
                    id: PLATFORM_ACCOUNT_ID,
                    status,
                    token_version: 0,
                    created_at: 500,
                    updated_at: 500,
                    deleted_at: null
                },
                profile: { ...state.profile }
            };
        },
        async updateProfileTextForOwner(
            input: UpdatePlatformProfileTextInput
        ): Promise<PlatformProfileSaveResult> {
            if (input.expectedUpdatedAt !== state.profile.updated_at) {
                return { status: "conflict", updatedAt: state.profile.updated_at };
            }
            const previousAvatarObjectKey = state.profile.avatar_object_key;
            state.profile = {
                ...state.profile,
                display_name: input.displayName,
                home_city: input.homeCity,
                bio: input.bio,
                updated_at: input.updatedAt
            };
            return {
                status: "saved",
                profile: { ...state.profile },
                previousAvatarObjectKey
            };
        }
    } as unknown as PlatformAccountRepository;

    fixture.services.platformTokens = platformTokens;
    fixture.services.platformAccounts = platformAccounts;
    fixture.services.config = {
        ...fixture.services.config,
        fudabaWriteEnabled: options.fudabaWrite ?? true
    };

    return {
        app: fixture.app,
        get profile() {
            return state.profile;
        },
        headers(extra: Record<string, string> = {}) {
            return { authorization: `Bearer ${PLATFORM_ACCESS_TOKEN}`, ...extra };
        }
    };
}

describe("Wiki wire-contract conformance", () => {
    test("public catalog and stories responses satisfy the shared wire schemas", async () => {
        const fixture = createWikiFixture();
        seedStoryContent(fixture);

        const catalog = await fixture.app.request("/api/wiki/catalog");
        assert.equal(catalog.status, 200);
        const catalogBody = wikiPublicCatalogSchema.parse(await catalog.json());
        assert.ok(catalogBody.agencies.length > 0);
        assert.ok(catalogBody.selection);

        const stories = await fixture.app.request(
            `/api/wiki/stories?agency=${encodeURIComponent("闪耀色彩")}` +
                `&idol=${encodeURIComponent("樱木真乃")}`
        );
        assert.equal(stories.status, 200);
        const storiesBody = wikiPublicStoriesSchema.parse(await stories.json());
        assert.equal(storiesBody.idol.name, "樱木真乃");
        assert.ok(
            storiesBody.categories.some((category) => category.cards.length > 0)
        );
    });

    test("admin catalog and stories responses satisfy the shared wire schemas", async () => {
        const fixture = createWikiFixture();
        seedStoryContent(fixture);
        const auth = await fixture.auth("editor");
        const headers = { Cookie: `token=${auth.token}` };

        const catalog = await fixture.app.request("/api/admin/wiki/catalog", {
            headers
        });
        assert.equal(catalog.status, 200);
        const catalogBody = wikiAdminCatalogSchema.parse(await catalog.json());
        assert.ok(catalogBody.agencies.length > 0);

        const stories = await fixture.app.request(
            `/api/admin/wiki/stories?agency=${encodeURIComponent("闪耀色彩")}` +
                `&idol=${encodeURIComponent("樱木真乃")}`,
            { headers }
        );
        assert.equal(stories.status, 200);
        const storiesBody = wikiAdminStoriesSchema.parse(await stories.json());
        assert.equal(storiesBody.idol.name, "樱木真乃");
        assert.ok(storiesBody.stories.length > 0);
    });
});

describe("Platform profile wire-contract conformance", () => {
    test("platformProfileView output satisfies the shared profile schema", () => {
        // Every avatar branch of the projection is exercised, because the
        // strict schema rejects both an unexpected key and a null-vs-string
        // drift in avatarUrl.
        const external = platformProfileView(platformProfileRecord({
            avatar_external_url: "https://avatars.example.test/owner.png"
        }));
        assert.equal(
            platformProfileSchema.parse(external).avatarUrl,
            "https://avatars.example.test/owner.png"
        );

        const stored = platformProfileView(platformProfileRecord({
            avatar_object_key: "protected/platform/avatar.webp",
            updated_at: 4_200
        }));
        assert.equal(
            platformProfileSchema.parse(stored).avatarUrl,
            "/api/platform/me/avatar?v=4200"
        );

        const missing = platformProfileView(platformProfileRecord());
        assert.equal(platformProfileSchema.parse(missing).avatarUrl, null);
    });

    test("profile read response satisfies the shared wire schema", async () => {
        const fixture = attachPlatformAccount(createWikiFixture(), {
            profile: { avatar_object_key: "protected/platform/avatar.webp" }
        });

        const response = await fixture.app.request("/api/platform/me", {
            headers: fixture.headers()
        });
        assert.equal(response.status, 200);
        const body = platformProfileResponseSchema.parse(await response.json());
        assert.deepEqual(body.account, {
            id: PLATFORM_ACCOUNT_ID,
            status: "active"
        });
        assert.equal(body.capabilities.fudabaWrite, true);
        assert.equal(body.profile.avatarUrl, "/api/platform/me/avatar?v=1000");
        assert.equal(body.profile.updatedAt, 1_000);
    });

    test("a restricted account still reads back a conforming profile", async () => {
        // `platformAccountSchema` narrows the four domain statuses to the two
        // the middleware lets through, so a restricted reader is the only
        // non-active status the wire contract has to accept.
        const fixture = attachPlatformAccount(createWikiFixture(), {
            status: "restricted",
            fudabaWrite: false
        });

        const response = await fixture.app.request("/api/platform/me", {
            headers: fixture.headers()
        });
        assert.equal(response.status, 200);
        const body = platformProfileResponseSchema.parse(await response.json());
        assert.equal(body.account.status, "restricted");
        assert.equal(body.capabilities.fudabaWrite, false);
    });

    test("profile mutation response satisfies the shared wire schema", async () => {
        const fixture = attachPlatformAccount(createWikiFixture());
        const expectedUpdatedAt = fixture.profile.updated_at;

        const response = await fixture.app.request("/api/platform/me", {
            method: "PUT",
            headers: fixture.headers({ "content-type": "application/json" }),
            body: JSON.stringify({
                displayName: "改名后的制作人",
                homeCity: null,
                bio: "更新后的简介",
                expectedUpdatedAt
            })
        });
        assert.equal(response.status, 200);
        const body = platformProfileMutationResponseSchema.parse(
            await response.json()
        );
        assert.equal(body.profile.displayName, "改名后的制作人");
        assert.equal(body.profile.homeCity, null);
        assert.ok(body.profile.updatedAt > expectedUpdatedAt);

        // The mutation envelope carries no account or capabilities block, so a
        // read-shaped payload leaking out of PUT would fail the strict parse.
        assert.deepEqual(Object.keys(body).sort(), ["profile", "success"]);
    });
});
