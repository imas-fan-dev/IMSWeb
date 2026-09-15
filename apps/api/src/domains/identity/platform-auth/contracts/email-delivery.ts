import { randomHex } from '@/utils/crypto/random';

export function createPlatformEmailDeliveryIdentityToken(): string {
    return randomHex(32);
}
