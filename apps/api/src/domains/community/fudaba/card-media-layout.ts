import type { FudabaCardOrigin } from '@/ports/repositories';

// Compatibility rows are the anonymous guest/legacy archive. Media now comes
// from page rows for every origin, so origin no longer implies a key layout.
export function isNamecardCompatibilityOrigin(origin: FudabaCardOrigin): boolean {
    return origin === 'guest' || origin === 'legacy';
}
