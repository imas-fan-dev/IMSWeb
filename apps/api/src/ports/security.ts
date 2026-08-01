export interface BackofficeJwtClaims {
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

export interface BackofficeTokenService {
    sign(
        claims: Omit<BackofficeJwtClaims, 'iat' | 'exp'>,
        expiresInSeconds: number
    ): Promise<string>;
    verify(token: string): Promise<BackofficeJwtClaims>;
}

export interface PasswordVerifier {
    verify(value: string, digest: string): Promise<boolean>;
    hash?(value: string): Promise<string>;
}

export interface SecurityServices {
    passwords: PasswordVerifier;
    backofficeTokens: BackofficeTokenService;
}
