import { sign, verify } from 'hono/utils/jwt/jwt';
import type { JwtClaims, TokenService } from '@/ports/security';

export class HmacTokenService implements TokenService {
    constructor(private readonly secret: string) {}

    async sign(claims: Omit<JwtClaims, 'iat' | 'exp'>, expiresInSeconds: number): Promise<string> {
        const iat = Math.floor(Date.now() / 1000);
        return sign({ ...claims, iat, exp: iat + expiresInSeconds }, this.secret, 'HS256');
    }

    async verify(token: string): Promise<JwtClaims> {
        const payload = await verify(token, this.secret, 'HS256');
        if (
            typeof payload.id !== 'number' || typeof payload.username !== 'string' ||
            typeof payload.dept !== 'string' || typeof payload.csrfSecret !== 'string' ||
            !(
                payload.adminRole === undefined || payload.adminRole === null ||
                payload.adminRole === 'admin' || payload.adminRole === 'super_admin'
            ) ||
            typeof payload.exp !== 'number' || payload.exp <= Math.floor(Date.now() / 1000)
        ) {
            throw new Error('Invalid JWT claims');
        }
        return payload as JwtClaims;
    }
}
