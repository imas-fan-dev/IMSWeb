export interface JwtClaims {
    id: number;
    username: string;
    producername: string;
    dept: string;
    csrfSecret: string;
    iat?: number;
    exp?: number;
    [key: string]: unknown;
}

export interface TokenService {
    sign(claims: Omit<JwtClaims, 'iat' | 'exp'>, expiresInSeconds: number): Promise<string>;
    verify(token: string): Promise<JwtClaims>;
}

export interface PasswordVerifier {
    verify(value: string, digest: string): Promise<boolean>;
}
