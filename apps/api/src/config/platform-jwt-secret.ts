const DEVELOPMENT_PLATFORM_SECRET =
    'dev-only-insecure-platform-secret-change-me';

export function parsePlatformJwtSecret(
    environment: NodeJS.ProcessEnv = process.env,
): string {
    const mode = String(environment.NODE_ENV || 'development')
        .trim()
        .toLowerCase();
    const production = mode === 'production';
    const platformSecret = environment.IMS_PLATFORM_JWT_SECRET;
    if (production) {
        if (!platformSecret) {
            throw new Error(
                'IMS_PLATFORM_JWT_SECRET is required in production and must be at least ' +
                    '32 UTF-8 bytes',
            );
        }
        if (Buffer.byteLength(platformSecret, 'utf8') < 32) {
            throw new Error(
                'IMS_PLATFORM_JWT_SECRET must be at least 32 UTF-8 bytes in production',
            );
        }
        if (
            platformSecret === environment.IMS_BACKOFFICE_JWT_SECRET ||
            platformSecret === environment.IMS_JWT_SECRET
        ) {
            throw new Error(
                'IMS_PLATFORM_JWT_SECRET must be different from all Backoffice JWT ' +
                    'verification secrets in production',
            );
        }
        return platformSecret;
    }
    if (platformSecret) return platformSecret;
    console.warn(
        '[SECURITY WARNING] IMS_PLATFORM_JWT_SECRET is not set; using an insecure ' +
            'development-only Platform secret.',
    );
    return DEVELOPMENT_PLATFORM_SECRET;
}
