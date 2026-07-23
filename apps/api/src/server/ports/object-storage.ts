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
    ownerToken?: string;
}

export interface ListedObject {
    key: string;
    size: number;
    etag: string;
}

export interface ObjectStorage {
    get(key: string): Promise<StoredObject | null>;
    put(key: string, body: Uint8Array, options?: PutObjectOptions): Promise<StoredObject>;
    putIfUnchanged?(
        key: string,
        expectedEtag: string | null,
        body: Uint8Array,
        options?: PutObjectOptions
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
        expectedOwnerToken: string
    ): Promise<boolean>;
    list(prefix: string): Promise<ListedObject[]>;
    deletePrefix(prefix: string): Promise<void>;
    close?(): void | Promise<void>;
    publish?(key: string): Promise<void>;
    recoverStaleUploads?(limit?: number, staleSeconds?: number): Promise<void>;
}
