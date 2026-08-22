export interface StoredObject {
    body: Uint8Array;
    size: number;
    contentType: string;
    etag: string;
    uploadedAt?: Date;
}

export interface PutObjectOptions {
    contentType?: string;
    sha256?: string;
    metadata?: Record<string, string>;
    deferredPublication?: boolean;
    protectedAccess?: boolean;
    ownerToken?: string;
}

export interface ListedObject {
    key: string;
    size: number;
    etag: string;
}

export interface ObjectReadUrlOptions {
    method?: "GET" | "HEAD";
}

export interface PublicObjectReadUrlOptions {
    publicPath?: string;
}

export interface ObjectReadTarget {
    url: string;
    visibility: "private" | "public";
}

export interface ObjectStorage {
    get(key: string): Promise<StoredObject | null>;
    createPublicReadUrl?(
        key: string,
        options?: PublicObjectReadUrlOptions,
    ): Promise<string | null>;
    createReadUrl?(
        key: string,
        options?: ObjectReadUrlOptions,
    ): Promise<ObjectReadTarget | null>;
    put(
        key: string,
        body: Uint8Array,
        options?: PutObjectOptions,
    ): Promise<StoredObject>;
    putIfUnchanged?(
        key: string,
        expectedEtag: string | null,
        body: Uint8Array,
        options?: PutObjectOptions,
    ): Promise<StoredObject | null>;
    delete(key: string): Promise<void>;
    deleteIfObjectId?(key: string, expectedObjectId: string): Promise<boolean>;
    deleteIfOwned?(key: string, expectedOwnerToken: string): Promise<boolean>;
    exists(key: string): Promise<boolean>;
    copy(sourceKey: string, destinationKey: string): Promise<void>;
    move(sourceKey: string, destinationKey: string): Promise<void>;
    moveIfOwned?(
        sourceKey: string,
        destinationKey: string,
        expectedOwnerToken: string,
    ): Promise<boolean>;
    list(prefix: string): Promise<ListedObject[]>;
    deletePrefix(prefix: string): Promise<void>;
    close?(): void | Promise<void>;
    publish?(key: string): Promise<void>;
    protect?(key: string): Promise<void>;
    currentObjectId?(key: string): Promise<string | null>;
    protectIfObjectId?(key: string, expectedObjectId: string): Promise<boolean>;
    reconcilePlacement?(key: string): Promise<boolean>;
    recoverStaleUploads?(limit?: number, staleSeconds?: number): Promise<void>;
}

export interface CompensationService {
    enqueue(kind: string, payload: unknown, error?: unknown): Promise<string>;
    run(storage: ObjectStorage, limit?: number): Promise<void>;
}

export interface ObjectDeletionWorker {
    run(limit?: number): Promise<void>;
    retryQuarantined(jobId: string): Promise<boolean>;
}

export interface ObjectCleanupRunner {
    start(): void;
    run(): Promise<void>;
    close(): Promise<void>;
    isIdle(): boolean;
}

export interface ObjectStorageServices {
    compensation: CompensationService;
    objectCleanup: ObjectCleanupRunner;
    objectDeletions: ObjectDeletionWorker;
    storage: ObjectStorage;
}
