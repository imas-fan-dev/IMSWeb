import type {
    PlatformEmailResendPolicyCache,
    PlatformEmailResendPolicyReader,
    PlatformEmailResendPolicyRecord,
} from '@/ports/email-delivery';
import type { PlatformEmailConfigurationStore } from '@/ports/email';
import { withBoundedCacheOperation } from '@/utils/cache/bounded-operation';

export type PlatformEmailResendPolicyCacheOperation =
    | 'read'
    | 'refill'
    | 'write-through';

export type PlatformEmailResendPolicyCacheErrorReporter = (
    operation: PlatformEmailResendPolicyCacheOperation,
) => void;

export function reportPlatformEmailResendPolicyCacheError(
    operation: PlatformEmailResendPolicyCacheOperation,
): void {
    console.error(JSON.stringify({
        event: 'platform_email_resend_policy_cache_error',
        operation,
    }));
}

export class CachedPlatformEmailResendPolicyReader
    implements PlatformEmailResendPolicyReader
{
    constructor(
        private readonly store: PlatformEmailConfigurationStore,
        private readonly cache?: PlatformEmailResendPolicyCache,
        private readonly reportError: PlatformEmailResendPolicyCacheErrorReporter =
            reportPlatformEmailResendPolicyCacheError,
    ) {}

    async getPolicy(): Promise<PlatformEmailResendPolicyRecord> {
        const cache = this.cache;
        if (cache) {
            try {
                const cached = await withBoundedCacheOperation(
                    (signal) => cache.read(signal),
                );
                if (cached) return cached;
            } catch {
                this.report('read');
            }
        }

        const configuration = await this.store.getPlatformEmailConfiguration();
        const policy = {
            resendCooldownSeconds: configuration.resendCooldownSeconds,
            updatedAt: configuration.updatedAt,
        };

        if (cache) {
            try {
                await withBoundedCacheOperation(
                    (signal) => cache.writeIfNewer(policy, signal),
                );
            } catch {
                this.report('refill');
            }
        }
        return policy;
    }

    private report(operation: PlatformEmailResendPolicyCacheOperation): void {
        try {
            this.reportError(operation);
        } catch {
            // Cache diagnostics must not change the PostgreSQL fallback result.
        }
    }
}
