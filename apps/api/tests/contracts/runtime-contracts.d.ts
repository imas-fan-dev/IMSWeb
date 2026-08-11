export interface ContractLogin {
    response: Response;
    token: string;
    cookie: string;
    csrf: string;
}

export interface CoreAuthContractFixture {
    runtime: string;
    expectedUser: { id: number; username: string; dept: string };
    request(path: string, init?: RequestInit): Promise<Response>;
    login(): Promise<ContractLogin>;
    cookieMutationPath: string;
    cookieMutationMethod?: string;
    cookieMutationBody?: string;
    cookieMutationContentType?: string;
    mutationSuccessStatus?: number;
    assertMutationState(state: 'before' | 'after-cookie' | 'after-authorization'): Promise<void>;
    resetMutation(): Promise<void>;
    setCookies(response: Response): string[];
    secureCookies: boolean;
}

export interface ReactionContractFixture {
    runtime: string;
    cardId: number;
    emoji?: string;
    headers?: Record<string, string>;
    request(path: string, init?: RequestInit): Promise<Response>;
}

export interface MediaRangeContractFixture {
    runtime: string;
    path: string;
    body: Uint8Array;
    contentType: string;
    etag?: string;
    headers?: Record<string, string>;
    request(path: string, init?: RequestInit): Promise<Response>;
}

export interface RejectedJwtContractFixture {
    runtime: string;
    tokens: Record<string, string>;
    request(path: string, init?: RequestInit): Promise<Response>;
}

export interface ParsedContractUpload {
    fields: Record<string, string>;
    files: Record<string, { filename: string } | Array<{ filename: string }> | undefined>;
}

export interface MultipartParserContractFixture {
    runtime: string;
    request(body: Uint8Array, contentType: string): Request;
    parse(
        request: Request,
        options: { maxBytes: number; fileFields: readonly string[] }
    ): Promise<ParsedContractUpload>;
}

export interface IdempotentReplayContractFixture<T = unknown> {
    runtime: string;
    operation: string;
    status?: number;
    body?: unknown;
    invoke(): Promise<Response>;
    snapshot(): Promise<T>;
}

export interface ContractUploadedFile {
    filename: string;
    contentType: string;
    body: Uint8Array;
}

export interface ControlledUpload {
    fields: Record<string, string>;
    files: Record<string, ContractUploadedFile | ContractUploadedFile[] | undefined>;
}

export interface CoreMutationSnapshot {
    news: number;
    events: number;
    cards: number;
    reactions: number;
    auditActions: string[];
    objects: number;
    compensation: { pending: number; completed: number };
}

export interface CoreMutationContractFixture {
    runtime: string;
    username: string;
    password: string;
    producername: string;
    approvedCardId: number;
    request(path: string, init?: RequestInit): Promise<Response>;
    setUpload(upload: ControlledUpload): void;
    snapshot(): Promise<CoreMutationSnapshot>;
    failObjectDeletes(value: boolean): void;
    runCompensation(): Promise<void>;
}

export interface PostCommitMediaSnapshot {
    news: number;
    events: number;
    cards: number;
    objects: number;
    compensationPending: number;
    pendingPublications?: number;
    readyPublications?: number;
}

export interface PostCommitMediaContractFixture {
    runtime: string;
    request(path: string, init?: RequestInit): Promise<Response>;
    opToken(): Promise<string>;
    setUpload(upload: ControlledUpload): void;
    postCommitSnapshot(): Promise<PostCommitMediaSnapshot>;
    mediaDeletionTargets(): Promise<{ news: number; event: number; card: number }>;
    failBusinessInserts(value: boolean): void;
    failObjectPuts(value: boolean): void;
    failObjectPublishes(value: boolean): void;
    failObjectDeletes(value: boolean): void;
    failCompensationEnqueues(value: boolean): void;
    recoverPublications?(): Promise<void>;
}

export interface UploadBoundarySnapshot {
    news: number;
    events: number;
    cards: number;
    chronicle: number;
    objects: number;
}

export interface UploadBoundaryContractFixture {
    runtime: string;
    request(path: string, init?: RequestInit): Promise<Response>;
    opToken(): Promise<string>;
    setUpload(upload: ControlledUpload): void;
    uploadSnapshot(): Promise<UploadBoundarySnapshot>;
}

export interface ChronicleRateSnapshot {
    count: number;
    writeCount: number;
    attemptCount: number;
    records: number;
    objects: number;
    parserCalls: number;
    storageMutations: number;
}

export interface ChronicleRateContractFixture {
    runtime: string;
    uploadChronicle(
        key: string,
        client: string,
        activityId: string,
        body?: BodyInit
    ): Promise<Response>;
    rateSnapshot(client: string): Promise<ChronicleRateSnapshot>;
}

export interface ConcurrentRateLimiterContractFixture {
    runtime: string;
    consume(client: string, identity: string): Promise<{ allowed: boolean }>;
    count(client: string): Promise<number>;
}

export interface AbuseProtectionSnapshot {
    userLookups: number;
    reactionLookups: number;
    reactionMutations: number;
}

export interface AbuseProtectionContractFixture {
    runtime: string;
    cardId: number;
    request(path: string, init?: RequestInit & { duplex?: 'half' }): Promise<Response>;
    blockNextGlobal(): void;
    primeRateLimit(bucket: string, count: number, limit: number, windowSeconds: number): Promise<void>;
    rateLimitCount(bucket: string): Promise<number>;
    compensationCount(): number;
    handlerSnapshot(): AbuseProtectionSnapshot;
}

export function assertAbuseProtectionContract(fixture: AbuseProtectionContractFixture): Promise<void>;
export function assertCoreAuthContract(fixture: CoreAuthContractFixture): Promise<ContractLogin>;
export function assertCoreMutationContract(fixture: CoreMutationContractFixture): Promise<void>;
export function assertPostCommitMediaContract(
    fixture: PostCommitMediaContractFixture
): Promise<void>;
export function assertChronicleRateContract(fixture: ChronicleRateContractFixture): Promise<void>;
export function assertConcurrentRateLimiterContract(
    fixture: ConcurrentRateLimiterContractFixture
): Promise<void>;
export function assertIdempotentReplayContract<T>(
    fixture: IdempotentReplayContractFixture<T>
): Promise<{ body: unknown; state: T }>;
export function assertReactionContract(fixture: ReactionContractFixture): Promise<void>;
export function assertRejectedJwtContract(fixture: RejectedJwtContractFixture): Promise<void>;
export function assertRouteUploadBoundaryContract(fixture: UploadBoundaryContractFixture): Promise<void>;
export function assertMediaRangeContract(fixture: MediaRangeContractFixture): Promise<void>;
export function assertMultipartParserContract(fixture: MultipartParserContractFixture): Promise<void>;
export function assertJsonResponse(response: Response, status: number, body: unknown, message: string): Promise<void>;
export function decodeJwtPart(token: string, index: number): Record<string, unknown>;
export function deepEqual(actual: unknown, expected: unknown, message: string): void;
export function equal(actual: unknown, expected: unknown, message: string): void;
