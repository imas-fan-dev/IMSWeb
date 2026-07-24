export type NodeObjectStorageConfig =
    | { type: 'filesystem' }
    | {
        type: 's3';
        bucket: string;
        region: string;
        endpoint?: string;
        forcePathStyle: boolean;
        prefix: string;
        readUrlTtlSeconds: number;
    };

function optionalValue(environment: NodeJS.ProcessEnv, name: string): string | undefined {
    const value = environment[name]?.trim();
    return value || undefined;
}

function requiredValue(environment: NodeJS.ProcessEnv, name: string): string {
    const value = optionalValue(environment, name);
    if (!value) throw new Error(`${name} is required when IMS_OBJECT_STORAGE=s3`);
    return value;
}

function parseBoolean(name: string, value: string | undefined, fallback: boolean): boolean {
    if (value === undefined) return fallback;
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    throw new Error(`${name} must be true or false`);
}

function parsePrefix(value: string | undefined): string {
    const prefix = value?.trim().replace(/^\/+|\/+$/g, '') || '';
    if (!prefix) return '';
    const segments = prefix.split('/');
    if (
        prefix.includes('\\') ||
        segments.some((segment) => !segment || segment === '.' || segment === '..')
    ) {
        throw new Error('IMS_S3_PREFIX must be a valid object-key prefix');
    }
    return prefix;
}

function parseEndpoint(value: string | undefined): string | undefined {
    if (!value) return undefined;
    let endpoint: URL;
    try {
        endpoint = new URL(value);
    } catch {
        throw new Error('IMS_S3_ENDPOINT must be a valid HTTP(S) URL');
    }
    if (
        !['http:', 'https:'].includes(endpoint.protocol) ||
        endpoint.username || endpoint.password || endpoint.search || endpoint.hash
    ) {
        throw new Error('IMS_S3_ENDPOINT must be a credential-free HTTP(S) URL');
    }
    return endpoint.toString().replace(/\/$/, '');
}

function parseReadUrlTtl(value: string | undefined): number {
    if (value === undefined) return 300;
    const ttl = Number(value);
    if (!Number.isSafeInteger(ttl) || ttl < 30 || ttl > 3600) {
        throw new Error('IMS_S3_READ_URL_TTL_SECONDS must be an integer between 30 and 3600');
    }
    return ttl;
}

export function parseNodeObjectStorageConfig(
    environment: NodeJS.ProcessEnv = process.env
): NodeObjectStorageConfig {
    const type = optionalValue(environment, 'IMS_OBJECT_STORAGE')?.toLowerCase() || 's3';
    if (type === 'filesystem') return { type };
    if (type !== 's3') {
        throw new Error('IMS_OBJECT_STORAGE must be filesystem or s3');
    }

    const bucket = requiredValue(environment, 'IMS_S3_BUCKET');
    if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) {
        throw new Error('IMS_S3_BUCKET must be a valid general-purpose S3 bucket name');
    }
    const region = optionalValue(environment, 'IMS_S3_REGION') ||
        optionalValue(environment, 'AWS_REGION');
    if (!region) {
        throw new Error('IMS_S3_REGION or AWS_REGION is required when IMS_OBJECT_STORAGE=s3');
    }
    if (/\s|[\u0000-\u001f\u007f]/.test(region)) {
        throw new Error('IMS_S3_REGION must be a valid region identifier');
    }

    return {
        type,
        bucket,
        region,
        endpoint: parseEndpoint(optionalValue(environment, 'IMS_S3_ENDPOINT')),
        forcePathStyle: parseBoolean(
            'IMS_S3_FORCE_PATH_STYLE',
            environment.IMS_S3_FORCE_PATH_STYLE,
            false
        ),
        prefix: parsePrefix(optionalValue(environment, 'IMS_S3_PREFIX')),
        readUrlTtlSeconds: parseReadUrlTtl(
            optionalValue(environment, 'IMS_S3_READ_URL_TTL_SECONDS')
        )
    };
}
