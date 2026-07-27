import bcrypt from 'bcrypt';
import type { PasswordVerifier } from '@/ports/security';

export class BcryptPasswordVerifier implements PasswordVerifier {
    verify(value: string, digest: string): Promise<boolean> {
        return bcrypt.compare(value, digest);
    }

    hash(value: string): Promise<string> {
        return bcrypt.hash(value, 12);
    }
}
