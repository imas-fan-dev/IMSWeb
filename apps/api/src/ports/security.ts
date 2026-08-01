export interface BackofficeJwtClaims {
    iss?: 'imsweb';
    aud?: 'ims-backoffice';
    kind?: 'backoffice';
    id: number;
    username: string;
    producername: string;
    dept: string;
    adminRole?: 'admin' | 'super_admin' | null;
    csrfSecret: string;
    iat?: number;
    exp?: number;
    [key: string]: unknown;
}

export type BackofficeAccessTokenInput = Omit<
    BackofficeJwtClaims,
    'iss' | 'aud' | 'kind' | 'iat' | 'exp'
>;

export interface BackofficeTokenService {
    sign(
        claims: BackofficeAccessTokenInput,
        expiresInSeconds: number
    ): Promise<string>;
    verify(token: string): Promise<BackofficeJwtClaims>;
    verifyLegacyCookie?(token: string): Promise<BackofficeJwtClaims>;
}

export interface PasswordVerifier {
    verify(value: string, digest: string): Promise<boolean>;
    hash?(value: string): Promise<string>;
}

export interface SecurityServices {
    passwords: PasswordVerifier;
    backofficeTokens: BackofficeTokenService;
}
